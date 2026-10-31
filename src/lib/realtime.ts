import "server-only";
import { deriveKey, hmacHex } from "@/lib/crypto";
import { appSecret, requireEnv } from "@/lib/env";

// Each session gets a Broadcast channel whose name is an HMAC of its id: impossible to guess without
// APP_SECRET, and only handed to the visitor who owns the session token. Nothing goes through
// postgres_changes, so the messages table is never exposed to the browser.
export function channelFor(sessionId: string): string {
  return `wc-${hmacHex(deriveKey(appSecret(), "realtime").toString("hex"), sessionId).slice(0, 40)}`;
}

export async function broadcast(sessionId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const url = requireEnv("supabaseUrl", "SUPABASE_URL");
  const key = requireEnv("supabaseServiceKey", "SUPABASE_SERVICE_ROLE_KEY");
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: channelFor(sessionId), event, payload, private: false }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error("realtime_broadcast_failed", { status: response.status });
  } catch (error) {
    // The widget also polls as a fallback, so a lost broadcast only delays the message.
    console.error("realtime_broadcast_failed", { error: (error as Error).message });
  }
}
