import "server-only";
import { signToken, verifyToken } from "@/lib/crypto";
import { appSecret } from "@/lib/env";
import { db } from "@/lib/supabase";

// Conversations opened from the panel's "Testar" tab carry a short-lived token signed for the admin;
// the server marks them is_test. A visitor can't forge it, so a real lead never ends up hidden as a test.
const TEST_TOKEN_SECONDS = 2 * 60 * 60;

export function createTestToken(): string {
  return signToken(appSecret(), "test-session", {}, TEST_TOKEN_SECONDS);
}

export function isValidTestToken(token: string | undefined): boolean {
  return Boolean(token) && verifyToken(appSecret(), "test-session", token) !== null;
}

export async function latestTestSessionId(): Promise<string | null> {
  const { data } = await db()
    .from("sessions")
    .select("id")
    .eq("is_test", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function isTestSession(sessionId: string): Promise<boolean> {
  const { data } = await db().from("sessions").select("is_test").eq("id", sessionId).maybeSingle();
  return data?.is_test === true;
}
