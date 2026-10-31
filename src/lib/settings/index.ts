import "server-only";
import { decrypt, encrypt, randomToken } from "@/lib/crypto";
import { appSecret } from "@/lib/env";
import { db } from "@/lib/supabase";
import { configSchema, parseConfig, secretsSchema, type WebchatConfig, type WebchatSecrets } from "./schema";

export type Settings = { config: WebchatConfig; secrets: WebchatSecrets };

function decodeSecrets(raw: string | null): WebchatSecrets {
  if (!raw) return secretsSchema.parse({});
  try {
    return secretsSchema.parse(JSON.parse(decrypt(appSecret(), raw)));
  } catch {
    // APP_SECRET changed: stored secrets can't be read anymore and must be entered again.
    console.error("settings_secrets_unreadable");
    return secretsSchema.parse({});
  }
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db().from("settings").select("config, secrets").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Não foi possível ler as configurações: ${error.message}`);

  const config = parseConfig(data?.config);
  const secrets = decodeSecrets(data?.secrets ?? null);

  // The two connection secrets are generated on first use, so the checklist always has values to copy.
  if (!secrets.outboundToken || !secrets.webhookSecret) {
    secrets.outboundToken ||= randomToken(32);
    secrets.webhookSecret ||= randomToken(32);
    await saveSecrets(secrets);
  }
  return { config, secrets };
}

export async function saveConfig(next: WebchatConfig): Promise<WebchatConfig> {
  const config = configSchema.parse(next);
  const { error } = await db().from("settings").upsert({ id: 1, config, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
  return config;
}

export async function saveSecrets(secrets: WebchatSecrets): Promise<void> {
  const payload = encrypt(appSecret(), JSON.stringify(secretsSchema.parse(secrets)));
  const { error } = await db().from("settings").upsert({ id: 1, secrets: payload, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Não foi possível salvar os segredos: ${error.message}`);
}

export type { WebchatConfig, WebchatSecrets };
