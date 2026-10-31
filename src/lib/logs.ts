import "server-only";
import { redact } from "@/lib/datacrazy/client";
import { db } from "@/lib/supabase";

export type LogKind =
  | "outbound" // DataCrazy → us (agent reply)
  | "webhook" // us → DataCrazy (visitor message)
  | "lead_webhook" // us → DataCrazy automation (form submitted)
  | "internal_note"
  | "api";

// Our own trail: DataCrazy always answers "success" and keeps its logs for 1 hour only.
// Never throws, and never stores secrets.
export async function logIntegration(
  kind: LogKind,
  status: "ok" | "error",
  summary: Record<string, unknown> = {},
  error?: string,
  sessionId?: string,
): Promise<void> {
  try {
    await db()
      .from("integration_logs")
      .insert({ kind, status, summary: redact(summary), error: error?.slice(0, 1000) ?? null, session_id: sessionId ?? null });
  } catch (err) {
    console.error("integration_log_failed", { kind, error: (err as Error).message });
  }
}
