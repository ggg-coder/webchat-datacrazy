import { z } from "zod";
import { buildLeadPayload, buildMessagePayload, postSigned } from "@/lib/datacrazy/webhook";
import { fail, ok, readJson } from "@/lib/http";
import { logIntegration } from "@/lib/logs";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-guard";

// Sends a fictitious visitor message (or lead) so the admin can check it shows up in DataCrazy.
// DataCrazy always answers 200 {"success":true}, so the real confirmation is seeing it in the inbox.
const bodySchema = z.object({ target: z.enum(["message", "lead"]).default("message") });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request, bodySchema);
  if ("error" in body) return fail(body.error);
  const { config, secrets } = await getSettings();
  const url = body.data.target === "lead" ? config.datacrazy.leadWebhookUrl : config.datacrazy.webhookUrl;
  if (!url)
    return fail(
      body.data.target === "lead" ? "Cole a URL do webhook da automação primeiro." : "Cole a URL de Webhook da Conexão Universal primeiro.",
    );

  const now = new Date().toISOString();
  const session = {
    // Fixed id: repeated tests land in the same test conversation instead of creating new contacts.
    id: "00000000-0000-4000-8000-000000000001",
    name: "Teste do Webchat",
    email: "teste@exemplo.com",
    phone: "5511900000000",
    pageUrl: config.company.website || "https://exemplo.com",
    referrer: null,
    utm: { source: "teste" },
    consentAt: now,
    consentVersion: config.form.consentVersion,
    createdAt: now,
  };
  const payload =
    body.data.target === "lead"
      ? buildLeadPayload(session, config.datacrazy.leadSource)
      : buildMessagePayload(
          session,
          {
            id: crypto.randomUUID(),
            text: `Mensagem de teste enviada pelo painel em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
            createdAt: now,
          },
          config.datacrazy.leadSource,
        );

  const result = await postSigned(url, secrets.webhookSecret, payload);
  await logIntegration(
    body.data.target === "lead" ? "lead_webhook" : "webhook",
    result.ok ? "ok" : "error",
    { test: true, status: result.status },
    result.ok ? undefined : result.error,
  );
  if (!result.ok) return fail(`O DataCrazy recusou o envio: ${result.error}`, 400);
  return ok({ status: result.status });
}
