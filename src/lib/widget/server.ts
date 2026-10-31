import "server-only";
import { signToken, verifyToken } from "@/lib/crypto";
import { appSecret, env, publicBaseUrl } from "@/lib/env";
import type { WebchatConfig } from "@/lib/settings/schema";
import { isOpenNow } from "./hours";
import type { PublicWidgetConfig } from "./shared";

// After this the visitor sees the form again; the old conversation stays in the panel and in DataCrazy.
const SESSION_TOKEN_SECONDS = 180 * 24 * 60 * 60;

export function createSessionToken(sessionId: string): string {
  return signToken(appSecret(), "session", { sid: sessionId }, SESSION_TOKEN_SECONDS);
}

export function sessionIdFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  // Header only: tokens in URLs end up in logs and browser history.
  const token = header.replace(/^Bearer\s+/i, "");
  return verifyToken<{ sid?: string }>(appSecret(), "session", token)?.sid ?? null;
}

// Widget calls come from the /embed iframe, which is always same-origin. Anything else is refused (CSRF).
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin GETs don't send it
  return origin === new URL(request.url).origin || origin === publicBaseUrl();
}

export function publicConfig(config: WebchatConfig): PublicWidgetConfig {
  return {
    companyName: config.company.name,
    privacyUrl: config.company.privacyUrl,
    appearance: config.appearance,
    form: config.form,
    isOpen: isOpenNow(config.hours),
    uploads: config.uploads,
    realtime: env.supabaseUrl && env.supabaseAnonKey ? { url: env.supabaseUrl, key: env.supabaseAnonKey } : null,
  };
}
