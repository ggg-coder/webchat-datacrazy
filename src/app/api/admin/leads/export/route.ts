import { formatPhone } from "@/lib/phone";
import { leadsForExport } from "@/lib/leads";
import { filtersFromUrl } from "@/lib/leads/filters";
import { localDate, toCsv } from "@/lib/leads/period";
import { requireAdmin } from "@/lib/admin-guard";

const STATUS = { ok: "enviado", pending: "pendente", failed: "falhou", skipped: "não configurado" } as Record<string, string>;

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { rows, timeZone } = await leadsForExport(filtersFromUrl(request.url));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone }) : "");
  const csv = toCsv([
    [
      "Data",
      "Nome",
      "E-mail",
      "Telefone",
      "Página de origem",
      "Referrer",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "Primeira mensagem",
      "Primeira resposta",
      "Automação de lead",
      "Consentimento (versão)",
      "ID do contato",
    ],
    ...(rows as unknown as Record<string, unknown>[]).map((row) => {
      const utm = (row.utm ?? {}) as Record<string, string>;
      return [
        when(row.created_at as string),
        row.name as string,
        row.email as string | null,
        row.phone ? formatPhone(row.phone as string) : "",
        row.page_url as string | null,
        row.referrer as string | null,
        utm.source,
        utm.medium,
        utm.campaign,
        when(row.first_message_at as string | null),
        when(row.first_agent_reply_at as string | null),
        STATUS[row.lead_webhook_status as string] ?? (row.lead_webhook_status as string),
        row.consent_version as string | null,
        row.id as string,
      ];
    }),
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-webchat-${localDate(new Date(), timeZone)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
