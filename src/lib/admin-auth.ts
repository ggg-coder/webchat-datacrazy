// Panel login through Supabase Auth (email + password). Admin users are created by hand in the Supabase
// dashboard (Authentication → Users). Used by proxy.ts too, so it reads process.env directly.
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };
type CookieAdapter = { getAll: () => { name: string; value: string }[]; setAll: (cookies: CookieToSet[]) => void };

function authEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.trim(), key: key.trim() } : null;
}

export function createAuthClient(cookies: CookieAdapter) {
  const env = authEnv();
  if (!env) throw new Error("SUPABASE_URL/SUPABASE_ANON_KEY não configuradas.");
  return createServerClient(env.url, env.key, {
    cookies,
    // The panel never uses a browser-side Supabase client, so the session cookies can be httpOnly.
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" },
  });
}

type Claims = { sub?: string; is_anonymous?: boolean; role?: string; amr?: { method?: string }[] | string[] };

// Only email+password users count as admins. Rejects anonymous sign-ins (possible with the public key
// shipped in the widget if the project enables them) and any other sign-in method.
export function isAdminClaims(claims: Claims | null | undefined): boolean {
  if (!claims?.sub || claims.is_anonymous === true || claims.role !== "authenticated") return false;
  const methods = (claims.amr ?? []).map((entry) => (typeof entry === "string" ? entry : entry.method));
  return methods.includes("password");
}

// The widget ships the public Supabase key, so with open sign-ups anyone could create an account and
// enter the panel. Login is refused until "Allow new users to sign up" is turned off.
let signupCache: { at: number; disabled: boolean } | null = null;

// Fails closed: any error, non-200 or unexpected body counts as "sign-ups open". Only a confirmed
// "disabled" answer is cached, and briefly, so re-enabling sign-ups locks the panel within a minute.
export async function isSignupDisabled(): Promise<boolean> {
  if (signupCache && Date.now() - signupCache.at < 60_000) return true;
  signupCache = null;
  const env = authEnv();
  if (!env) return false;
  try {
    const response = await fetch(`${env.url}/auth/v1/settings`, { headers: { apikey: env.key }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const settings = (await response.json()) as { disable_signup?: unknown };
    if (settings.disable_signup !== true) return false;
    signupCache = { at: Date.now(), disabled: true };
    return true;
  } catch {
    return false;
  }
}

export const SIGNUP_OPEN_MESSAGE =
  "Por segurança, desative o cadastro público no Supabase: Authentication → Sign In / Providers → desligue “Allow new users to sign up” e salve. Depois tente entrar de novo.";
