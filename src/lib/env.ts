import "server-only";

// Reads environment variables accepting the names used by the Supabase ↔ Vercel integration
// (SUPABASE_URL, POSTGRES_URL_NON_POOLING...) and the ones a manual setup would use.
function first(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export type EnvStatus = {
  supabaseUrl: boolean;
  supabaseServiceKey: boolean;
  supabaseAnonKey: boolean;
  databaseUrl: boolean;
  appSecret: boolean;
};

export const env = {
  get supabaseUrl() {
    return first("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return first("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  },
  // Public key, sent to the widget at runtime so it can subscribe to Realtime.
  get supabaseAnonKey() {
    return first("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  // Direct connection used only to run migrations from the panel. Optional: without it the
  // README explains how to paste the SQL in the Supabase SQL Editor.
  get databaseUrl() {
    return first("POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL");
  },
  get appSecret() {
    return first("APP_SECRET");
  },
  get cronSecret() {
    return first("CRON_SECRET");
  },
};

// Public origin of this deployment, used in links sent to DataCrazy (attachments). Vercel sets
// VERCEL_PROJECT_PRODUCTION_URL automatically; APP_URL overrides it (custom domain, local tunnel).
export function publicBaseUrl(requestUrl?: string): string {
  const explicit = first("APP_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = first("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercel) return `https://${vercel}`;
  return requestUrl ? new URL(requestUrl).origin : "http://localhost:3000";
}

export function envStatus(): EnvStatus {
  return {
    supabaseUrl: Boolean(env.supabaseUrl),
    supabaseServiceKey: Boolean(env.supabaseServiceKey),
    supabaseAnonKey: Boolean(env.supabaseAnonKey),
    databaseUrl: Boolean(env.databaseUrl),
    appSecret: (env.appSecret?.length ?? 0) >= 32,
  };
}

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Variável de ambiente ${name} não configurada na Vercel.`);
  }
}

export function requireEnv<K extends keyof typeof env>(key: K, label: string): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (!value) throw new MissingEnvError(label);
  return value as NonNullable<(typeof env)[K]>;
}

export function appSecret(): string {
  const secret = requireEnv("appSecret", "APP_SECRET");
  if (secret.length < 32) throw new Error("APP_SECRET precisa ter pelo menos 32 caracteres.");
  return secret;
}
