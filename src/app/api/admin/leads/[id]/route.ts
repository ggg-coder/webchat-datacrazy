import { fail, ok } from "@/lib/http";
import { deleteVisitorData } from "@/lib/leads";
import { logIntegration } from "@/lib/logs";
import { toPublicMessage } from "@/lib/messages";
import type { MessageRow } from "@/lib/repo";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read-only conversation history: the attendance itself happens in DataCrazy.
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/leads/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Lead não encontrado.", 404);
  const [session, messages, logs] = await Promise.all([
    db().from("sessions").select("*").eq("id", id).maybeSingle(),
    db().from("messages").select("*").eq("session_id", id).order("created_at", { ascending: true }).limit(500),
    db()
      .from("integration_logs")
      .select("kind, status, error, created_at")
      .eq("session_id", id)
      .order("id", { ascending: false })
      .limit(30),
  ]);
  if (!session.data) return fail("Lead não encontrado.", 404);
  return ok({
    session: session.data,
    messages: ((messages.data ?? []) as MessageRow[]).map((row) => ({
      ...toPublicMessage(row),
      deliveryStatus: row.delivery_status,
      lastError: row.last_error,
    })),
    logs: logs.data ?? [],
  });
}

// LGPD: "apagar dados deste visitante".
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/leads/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Lead não encontrado.", 404);
  if (!(await deleteVisitorData(id))) return fail("Lead não encontrado.", 404);
  // No personal data in the log: only that a deletion happened.
  await logIntegration("api", "ok", { action: "visitor_data_deleted" });
  return ok({});
}
