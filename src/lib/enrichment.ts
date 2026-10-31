import "server-only";
import { DataCrazyApiError, DataCrazyClient } from "@/lib/datacrazy/client";
import { buildInternalNote, findConversationForVisitor } from "@/lib/datacrazy/note";
import { logIntegration } from "@/lib/logs";
import { rateLimit } from "@/lib/rate-limit";
import { getSession, toSessionData, updateSession } from "@/lib/repo";
import { getSettings } from "@/lib/settings";

// DataCrazy allows ~30 calls/min per account (observed); keep a shared budget well below it.
export function dataCrazyClient(apiKey: string) {
  return new DataCrazyClient({ apiKey, acquire: () => rateLimit("datacrazy-api", 60, 20) });
}

// DataCrazy processes webhooks in a queue, so the conversation shows up a few seconds after the first
// message. Short waits run inline (inside after()); after that the cron takes over.
const INLINE_DELAYS_MS = [3_000, 10_000, 30_000];
const CRON_DELAYS_S = [120, 600, 1800, 7200];
const MAX_NOTE_ATTEMPTS = INLINE_DELAYS_MS.length + CRON_DELAYS_S.length;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function scheduleInternalNote(sessionId: string): Promise<void> {
  const { config, secrets } = await getSettings();
  if (!config.datacrazy.internalNote || !secrets.dcApiKey) return;
  await updateSession(sessionId, { note_status: "pending", note_attempts: 0, note_error: null, note_next_at: null });
  for (const delay of INLINE_DELAYS_MS) {
    await sleep(delay);
    if (await processInternalNote(sessionId)) return;
  }
}

// One attempt. Returns true when finished (posted, skipped or given up).
export async function processInternalNote(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || session.note_status === "ok" || session.note_status === "skipped") return true;
  const { config, secrets } = await getSettings();
  if (!secrets.dcApiKey) {
    await updateSession(sessionId, { note_status: "skipped", note_error: "Sem API key do DataCrazy." });
    return true;
  }

  const attempts = session.note_attempts + 1;
  const client = dataCrazyClient(secrets.dcApiKey);
  const reschedule = async (reason: string, seconds?: number) => {
    const delay = CRON_DELAYS_S[Math.max(0, attempts - INLINE_DELAYS_MS.length - 1)] ?? null;
    const giveUp = attempts >= MAX_NOTE_ATTEMPTS;
    await updateSession(sessionId, {
      note_status: giveUp ? "failed" : "pending",
      note_attempts: attempts,
      note_error: reason,
      note_next_at: giveUp ? null : new Date(Date.now() + (seconds ?? delay ?? 120) * 1000).toISOString(),
    });
    if (giveUp) await logIntegration("internal_note", "error", { attempts }, reason, sessionId);
    return giveUp;
  };

  try {
    const conversationId =
      session.dc_conversation_id ?? (await findConversationForVisitor(client, session.id, config.datacrazy.instanceId));
    if (!conversationId) return reschedule("Conversa ainda não apareceu no DataCrazy.");

    const note = await buildInternalNote(client, toSessionData(session), session.user_agent);
    await client.addInternalNote(conversationId, note);
    await updateSession(sessionId, {
      note_status: "ok",
      note_attempts: attempts,
      note_error: null,
      note_next_at: null,
      dc_conversation_id: conversationId,
    });
    await logIntegration("internal_note", "ok", { attempts, conversationId }, undefined, sessionId);
    return true;
  } catch (error) {
    const message = (error as Error).message;
    const retryAfter = error instanceof DataCrazyApiError && error.status === 429 ? error.retryAfterSeconds : undefined;
    if (error instanceof DataCrazyApiError && (error.status === 401 || error.status === 403)) {
      await updateSession(sessionId, { note_status: "failed", note_attempts: attempts, note_error: message, note_next_at: null });
      await logIntegration("internal_note", "error", { attempts, status: error.status }, message, sessionId);
      return true;
    }
    return reschedule(message, retryAfter);
  }
}
