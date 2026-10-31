import { ok } from "@/lib/http";
import { createTestToken } from "@/lib/test-session";
import { requireAdmin } from "@/lib/admin-guard";

// Handed to the chat embedded in the "Testar" tab, so the session it creates is marked as a test.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return ok({ token: createTestToken() });
}
