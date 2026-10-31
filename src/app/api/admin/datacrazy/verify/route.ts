import { DataCrazyApiError } from "@/lib/datacrazy/client";
import { verifyConnection, type UniversalConfig } from "@/lib/datacrazy/verify";
import { dataCrazyClient } from "@/lib/enrichment";
import { publicBaseUrl } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { getSettings, saveConfig } from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-guard";

type RawInstance = { id: string; name: string; platform?: string; webhook?: string; config?: UniversalConfig };

// Checks the Universal Connection saved in DataCrazy against this app and fills in the webhook URL.
// The raw instance holds the connection credentials in plain text: it never leaves this function.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { config, secrets } = await getSettings();
  if (!secrets.dcApiKey) return fail("Cadastre a API key do DataCrazy primeiro.");
  if (!config.datacrazy.instanceId) return fail("Escolha qual conexão é a do webchat.");

  let instance: RawInstance;
  try {
    instance = await dataCrazyClient(secrets.dcApiKey).request<RawInstance>(
      "GET",
      `/api/v1/instances/${encodeURIComponent(config.datacrazy.instanceId)}`,
    );
  } catch (error) {
    return fail(error instanceof DataCrazyApiError ? error.message : "Não foi possível falar com o DataCrazy.", 400);
  }

  const checks = verifyConnection(instance.config ?? {}, { baseUrl: publicBaseUrl(request.url), ...secrets }, instance.platform);

  // The instance knows its own webhook URL: keep ours in sync so nobody has to copy it by hand.
  let webhookUpdated = false;
  if (instance.webhook && /^https:\/\//.test(instance.webhook) && instance.webhook !== config.datacrazy.webhookUrl) {
    await saveConfig({ ...config, datacrazy: { ...config.datacrazy, webhookUrl: instance.webhook } });
    webhookUpdated = true;
  }
  checks.push({ tab: "Geral", label: "URL de Webhook salva no painel", ok: Boolean(instance.webhook) });

  return ok({ checks, webhookUpdated, name: instance.name });
}
