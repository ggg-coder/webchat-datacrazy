import { z } from "zod";
import { DataCrazyApiError } from "@/lib/datacrazy/client";
import { dataCrazyClient } from "@/lib/enrichment";
import { fail, ok, readJson } from "@/lib/http";
import { logIntegration } from "@/lib/logs";
import { getSettings, saveSecrets } from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-guard";

// Validates the key against GET /api/v1/instances and only then stores it (encrypted).
const bodySchema = z.object({ apiKey: z.string().trim().min(10).max(500) });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request, bodySchema);
  if ("error" in body) return fail("Cole a API key gerada em crm.datacrazy.io/config/api.");
  const apiKey = body.data.apiKey;
  if (!apiKey.startsWith("dc_")) return fail("A API key do DataCrazy começa com dc_. Copie a chave inteira, com o prefixo.");

  try {
    const result = await dataCrazyClient(apiKey).listInstances();
    const { secrets } = await getSettings();
    await saveSecrets({ ...secrets, dcApiKey: apiKey });
    await logIntegration("api", "ok", { action: "api_key_saved", instances: result.data?.length ?? 0 });
    return ok({ instances: result.data ?? [] });
  } catch (error) {
    const message = error instanceof DataCrazyApiError ? error.message : "Não foi possível falar com o DataCrazy.";
    await logIntegration("api", "error", { action: "api_key_test" }, message);
    return fail(message, 400);
  }
}

export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { secrets } = await getSettings();
  await saveSecrets({ ...secrets, dcApiKey: "" });
  return ok({});
}
