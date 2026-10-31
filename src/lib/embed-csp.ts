// Content-Security-Policy for the /embed iframe. Used by proxy.ts, so it talks to Supabase REST directly.
const CACHE_MS = 60_000;
let cache: { at: number; origins: string[] } | null = null;

// Keeps only well-formed origins ("https://www.site.com.br", optionally "https://*.site.com"), so nothing
// stored in the settings can inject other directives.
export function normalizeOrigins(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => String(value).trim().replace(/\/+$/, ""))
    .filter((value) => /^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/i.test(value));
}

// null = couldn't read the settings (and nothing cached): the caller must fail closed.
export async function allowedOrigins(): Promise<string[] | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.origins;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return cache?.origins ?? null;
  try {
    const response = await fetch(`${url}/rest/v1/settings?id=eq.1&select=config`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = (await response.json()) as { config?: { security?: { allowedOrigins?: unknown } } }[];
    if (!Array.isArray(rows)) throw new Error("unexpected body");
    const origins = normalizeOrigins(rows[0]?.config?.security?.allowedOrigins);
    cache = { at: Date.now(), origins };
    return origins;
  } catch {
    // Keep the last known list if the database hiccups; otherwise report "unknown".
    return cache?.origins ?? null;
  }
}

export function embedCsp(origins: string[] | null, supabaseUrl: string | undefined, dev: boolean): string {
  // null (settings unreadable): only this app may frame the chat. Empty list (fresh install, nothing
  // configured yet): any site can embed, so the admin can test; the panel warns about it.
  const ancestors = origins === null ? "'self'" : origins.length ? `'self' ${origins.join(" ")}` : "*";
  const supabase = supabaseUrl ? `${supabaseUrl} ${supabaseUrl.replace(/^http/, "ws")}` : "";
  return [
    `frame-ancestors ${ancestors}`,
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${supabase}`.trim(),
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}
