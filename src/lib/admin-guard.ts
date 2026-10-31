import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAuthClient, isAdminClaims, isSignupDisabled } from "@/lib/admin-auth";

// Second line of defense behind proxy.ts: every admin route handler checks the session itself, so a
// matcher mistake can't expose secrets, personal data or destructive actions.
export async function requireAdmin(): Promise<NextResponse | null> {
  const deny = () => NextResponse.json({ ok: false, error: "Sessão expirada. Entre novamente no painel." }, { status: 401 });
  if (!(await isSignupDisabled())) return deny();
  try {
    const store = await cookies();
    const supabase = createAuthClient({ getAll: () => store.getAll(), setAll: () => {} });
    const { data } = await supabase.auth.getClaims();
    return isAdminClaims(data?.claims) ? null : deny();
  } catch {
    return deny();
  }
}
