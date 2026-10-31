import { DataCrazyApiError } from "@/lib/datacrazy/client";
import { dataCrazyClient } from "@/lib/enrichment";
import { fail, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-guard";

// Connections of the account, so the admin picks which one is the webchat's Universal Connection.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { secrets } = await getSettings();
  if (!secrets.dcApiKey) return fail("Cadastre a API key do DataCrazy primeiro.", 400);
  try {
    const result = await dataCrazyClient(secrets.dcApiKey).listInstances();
    return ok({ instances: result.data ?? [] });
  } catch (error) {
    return fail(error instanceof DataCrazyApiError ? error.message : "Não foi possível falar com o DataCrazy.", 400);
  }
}
