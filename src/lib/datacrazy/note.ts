// Internal note with the pre-chat form data, posted once in the DataCrazy conversation so the agent
// sees email/phone even when the lead automation didn't run.
import { formatPhone } from "@/lib/phone";
import type { DataCrazyClient, DcLead } from "./client";
import type { SessionData } from "./webhook";

// The conversation's contact.contactId is the visitorId we sent. Search by it, then match exactly.
export async function findConversationForVisitor(client: DataCrazyClient, visitorId: string, instanceId?: string): Promise<string | null> {
  const result = await client.findConversations(visitorId, instanceId || undefined);
  return result.data?.find((conversation) => conversation.contact?.contactId === visitorId)?.id ?? null;
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

// Leads that already have this email/phone: reported, never merged (the public API has no merge).
export async function findExistingLeads(client: DataCrazyClient, session: SessionData): Promise<DcLead[]> {
  const found = new Map<string, DcLead>();
  const searches: [string, "email" | "phone"][] = [];
  if (session.email) searches.push([session.email, "email"]);
  if (session.phone) searches.push([session.phone, "phone"]);
  for (const [value, type] of searches) {
    try {
      const result = await client.searchLeads(value, type);
      for (const lead of result.data ?? []) {
        const ownedByVisitor = lead.contacts?.some((contact) => contact.contactId === session.id);
        if (!ownedByVisitor) found.set(lead.id, lead);
      }
    } catch {
      // Best effort: the note is still useful without this line.
    }
  }
  return [...found.values()];
}

export function formatInternalNote(session: SessionData, userAgent: string | null, existing: DcLead[]): string {
  const utms = Object.entries(session.utm)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  const lines = [
    "📋 Dados do formulário do webchat",
    `Nome: ${session.name}`,
    `E-mail: ${session.email ?? "—"}`,
    `Telefone: ${session.phone ? formatPhone(session.phone) : "—"}`,
    `Página de origem: ${session.pageUrl ?? "—"}`,
    ...(session.referrer ? [`Veio de: ${session.referrer}`] : []),
    ...(utms ? [`UTMs: ${utms}`] : []),
    ...(userAgent ? [`Navegador: ${userAgent}`] : []),
    `Consentimento LGPD: ${session.consentVersion ? `versão ${session.consentVersion} em ${formatDate(session.consentAt)}` : "—"}`,
    `Início: ${formatDate(session.createdAt)}`,
  ];
  if (existing.length) {
    lines.push("", "⚠️ Possível lead existente com o mesmo e-mail/telefone:");
    for (const lead of existing.slice(0, 3)) lines.push(`• ${lead.name ?? "Sem nome"} (ID ${lead.id})`);
  }
  return lines.join("\n");
}

export async function buildInternalNote(client: DataCrazyClient, session: SessionData, userAgent: string | null): Promise<string> {
  return formatInternalNote(session, userAgent, await findExistingLeads(client, session));
}
