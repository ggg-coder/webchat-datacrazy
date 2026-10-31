import { publicBaseUrl } from "@/lib/env";
import { ok } from "@/lib/http";
import { toPublicMessage } from "@/lib/messages";
import type { MessageRow, SessionRow } from "@/lib/repo";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/supabase";
import { latestTestSessionId } from "@/lib/test-session";
import { requireAdmin } from "@/lib/admin-guard";

// What happened with the most recent conversation opened from the "Testar" tab.
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { config, secrets } = await getSettings();
  const baseUrl = publicBaseUrl(request.url);
  const environment = {
    baseUrl,
    reachable: !/^https?:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(baseUrl),
    webhookUrl: Boolean(config.datacrazy.webhookUrl),
    leadWebhookUrl: Boolean(config.datacrazy.leadWebhookUrl),
    hasApiKey: Boolean(secrets.dcApiKey),
    internalNote: config.datacrazy.internalNote,
  };

  const sessionId = await latestTestSessionId();
  if (!sessionId) return ok({ environment, session: null, messages: [], logs: [] });

  const [session, messages, logs] = await Promise.all([
    db().from("sessions").select("*").eq("id", sessionId).single(),
    db().from("messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(50),
    db()
      .from("integration_logs")
      .select("id, kind, status, summary, error, created_at")
      .eq("session_id", sessionId)
      .order("id", { ascending: true })
      .limit(100),
  ]);
  const row = session.data as SessionRow & { lead_webhook_error: string | null; note_error: string | null };

  return ok({
    environment,
    session: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      createdAt: row.created_at,
      leadWebhook: { status: row.lead_webhook_status, error: row.lead_webhook_error },
      note: { status: row.note_status, error: row.note_error },
    },
    messages: ((messages.data ?? []) as MessageRow[]).map((message) => ({
      ...toPublicMessage(message),
      deliveryStatus: message.delivery_status,
      attempts: message.attempts,
      lastError: message.last_error,
    })),
    logs: logs.data ?? [],
  });
}
