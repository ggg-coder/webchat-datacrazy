import { z } from "zod";
import { deliverLeadWebhook, deliverVisitorMessage } from "@/lib/delivery";
import { processInternalNote } from "@/lib/enrichment";
import { fail, ok, readJson } from "@/lib/http";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

const bodySchema = z.object({ target: z.enum(["lead", "note", "messages"]) });

// "Tentar de novo" for one lead: the automation webhook, the internal note or undelivered messages.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/leads/[id]/retry">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJson(request, bodySchema);
  if ("error" in body) return fail(body.error);
  const { data: session } = await db().from("sessions").select("id").eq("id", id).maybeSingle();
  if (!session) return fail("Lead não encontrado.", 404);

  if (body.data.target === "lead") {
    await db()
      .from("sessions")
      .update({ lead_webhook_status: "pending", lead_webhook_attempts: 0, lead_webhook_next_at: null })
      .eq("id", id);
    await deliverLeadWebhook(id);
  } else if (body.data.target === "note") {
    await db().from("sessions").update({ note_status: "pending", note_attempts: 0, note_next_at: null }).eq("id", id);
    await processInternalNote(id);
  } else {
    const { data } = await db()
      .from("messages")
      .select("id")
      .eq("session_id", id)
      .eq("author", "visitor")
      .in("delivery_status", ["pending", "failed"]);
    for (const row of data ?? []) {
      await db().from("messages").update({ delivery_status: "pending", attempts: 0, next_attempt_at: null }).eq("id", row.id);
      await deliverVisitorMessage(row.id as string);
    }
  }
  return ok({});
}
