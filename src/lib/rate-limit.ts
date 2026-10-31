import "server-only";
import { db } from "@/lib/supabase";

// In-memory fallback while the schema does not exist yet (first login) or the DB is unreachable.
// Per instance only, which is good enough to slow down brute force in that window.
const memory = new Map<string, { start: number; count: number }>();

function memoryHit(key: string, windowSeconds: number, max: number): boolean {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    memory.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

// Returns true when the call is allowed.
export async function rateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const { data, error } = await db().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    return data === true;
  } catch {
    return memoryHit(key, windowSeconds, max);
  }
}

// Gives back one unit taken by rateLimit() (e.g. a login that succeeded), atomically.
export async function refundRateLimit(key: string): Promise<void> {
  const local = memory.get(key);
  if (local) local.count = Math.max(0, local.count - 1);
  try {
    await db().rpc("rate_limit_refund", { p_key: key });
  } catch {}
}

// Clears a counter, e.g. after a successful login so only failures add up.
export async function resetRateLimit(key: string): Promise<void> {
  memory.delete(key);
  try {
    await db().from("rate_limits").delete().eq("key", key);
  } catch {}
}

// x-vercel-forwarded-for is set by Vercel's edge and can't be overridden by the client. x-real-ip and
// x-forwarded-for are only trustworthy behind a proxy that rewrites them (Vercel does); self-hosting
// without such a proxy makes per-IP limits spoofable.
export function clientIp(request: Request): string {
  const header = (name: string) => request.headers.get(name)?.split(",")[0]?.trim();
  return header("x-vercel-forwarded-for") ?? header("x-real-ip") ?? header("x-forwarded-for") ?? "unknown";
}
