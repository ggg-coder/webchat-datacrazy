import "server-only";
import { deliverLeadWebhook, deliverVisitorMessage } from "@/lib/delivery";
import { processInternalNote } from "@/lib/enrichment";
import { deleteVisitorData } from "@/lib/leads";
import { getSettings } from "@/lib/settings";
import { STORAGE_BUCKET, db } from "@/lib/supabase";

const BATCH = 50;

async function removeOrphanUploads(): Promise<number> {
  const { data: old } = await db()
    .from("attachments")
    .select("id, path")
    .lt("created_at", new Date(Date.now() - 3600_000).toISOString())
    .limit(200);
  if (!old?.length) return 0;
  const ids = old.map((row) => row.id as string);
  const { data: used } = await db().from("messages").select("attachment").in("attachment->>attachmentId", ids);
  const referenced = new Set((used ?? []).map((row) => (row.attachment as { attachmentId?: string } | null)?.attachmentId));
  const orphans = old.filter((row) => !referenced.has(row.id as string));
  if (!orphans.length) return 0;
  await db()
    .storage.from(STORAGE_BUCKET)
    .remove(orphans.map((row) => row.path as string));
  await db()
    .from("attachments")
    .delete()
    .in(
      "id",
      orphans.map((row) => row.id as string),
    );
  return orphans.length;
}

export type JobReport = { messages: number; leads: number; notes: number; expired: number; orphans: number; cleaned: boolean };

// Retries everything that is due: visitor messages not yet accepted by DataCrazy, lead automation
// webhooks and internal notes. Then applies the retention policy. Used by the Vercel cron and by the
// "Reprocessar pendentes" button in the panel.
export async function runPendingJobs(): Promise<JobReport> {
  const now = new Date().toISOString();
  const [messages, leads, notes] = await Promise.all([
    db().from("messages").select("id").eq("delivery_status", "pending").lte("next_attempt_at", now).limit(BATCH),
    db()
      .from("sessions")
      .select("id")
      .eq("lead_webhook_status", "pending")
      .or(`lead_webhook_next_at.lte.${now},and(lead_webhook_next_at.is.null,created_at.lt.${new Date(Date.now() - 60_000).toISOString()})`)
      .limit(BATCH),
    db().from("sessions").select("id").eq("note_status", "pending").lte("note_next_at", now).limit(BATCH),
  ]);

  // Messages that never got a first attempt (e.g. the function was cut short) have no next_attempt_at.
  const fresh = await db()
    .from("messages")
    .select("id")
    .eq("delivery_status", "pending")
    .is("next_attempt_at", null)
    .lte("created_at", new Date(Date.now() - 60_000).toISOString())
    .limit(BATCH);

  const messageIds = [...new Set([...(messages.data ?? []), ...(fresh.data ?? [])].map((row) => row.id as string))];
  for (const id of messageIds) await deliverVisitorMessage(id);
  for (const row of leads.data ?? []) await deliverLeadWebhook(row.id as string);
  for (const row of notes.data ?? []) await processInternalNote(row.id as string);

  // Retention: expired visitors are removed with their files (SQL alone can't delete Storage objects).
  const { config } = await getSettings();
  let expired = 0;
  if (config.retention.days > 0) {
    const cutoff = new Date(Date.now() - config.retention.days * 24 * 3600_000).toISOString();
    const { data } = await db()
      .from("sessions")
      .select("id")
      .or(`last_message_at.lt.${cutoff},and(last_message_at.is.null,created_at.lt.${cutoff})`)
      .limit(200);
    for (const row of data ?? []) if (await deleteVisitorData(row.id as string)) expired++;
  }
  // Files uploaded but never sent in a message (abandoned or abusive uploads): removed after 1 hour.
  const orphans = await removeOrphanUploads();

  // Integration logs (7 days) and expired rate-limit windows.
  const cleanup = await db().rpc("cleanup", { p_retention_days: 0 });

  return {
    messages: messageIds.length,
    leads: leads.data?.length ?? 0,
    notes: notes.data?.length ?? 0,
    expired,
    orphans,
    cleaned: !cleanup.error,
  };
}
