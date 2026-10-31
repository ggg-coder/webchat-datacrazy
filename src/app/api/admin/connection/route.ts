import { z } from "zod";
import { randomToken } from "@/lib/crypto";
import { publicBaseUrl } from "@/lib/env";
import { isAllowedWebhookUrl } from "@/lib/datacrazy/webhook";
import { fail, ok, readJson } from "@/lib/http";
import { getSettings, saveConfig, saveSecrets } from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-guard";

// Values the admin copies into the DataCrazy Universal Connection, plus the webhook URLs pasted back.
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { config, secrets } = await getSettings();
  return ok({
    baseUrl: publicBaseUrl(request.url),
    outboundToken: secrets.outboundToken,
    webhookSecret: secrets.webhookSecret,
    webhookUrl: config.datacrazy.webhookUrl,
    leadWebhookUrl: config.datacrazy.leadWebhookUrl,
    hasApiKey: Boolean(secrets.dcApiKey),
  });
}

const urlField = z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "URL inválida" })]).optional();

const putSchema = z.object({
  webhookUrl: urlField,
  leadWebhookUrl: urlField,
  regenerate: z.enum(["outboundToken", "webhookSecret"]).optional(),
});

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request, putSchema);
  if ("error" in body) return fail(body.error);
  const { config, secrets } = await getSettings();

  for (const url of [body.data.webhookUrl, body.data.leadWebhookUrl]) {
    if (url && !isAllowedWebhookUrl(url))
      return fail("Use a URL fornecida pelo DataCrazy (começa com https:// e termina em datacrazy.io/…).");
  }
  if (body.data.webhookUrl !== undefined) config.datacrazy.webhookUrl = body.data.webhookUrl;
  if (body.data.leadWebhookUrl !== undefined) config.datacrazy.leadWebhookUrl = body.data.leadWebhookUrl;
  await saveConfig(config);

  if (body.data.regenerate) {
    secrets[body.data.regenerate] = randomToken(32);
    await saveSecrets(secrets);
  }
  return GET(request);
}
