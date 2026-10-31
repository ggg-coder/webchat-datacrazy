// Payloads we POST to DataCrazy: visitor messages (Universal Connection webhook) and the lead
// automation webhook fired when the pre-chat form is submitted. Pure functions + a signed POST.
import { webhookSignature } from "@/lib/crypto";
import { formatPhone } from "@/lib/phone";

export const SIGNATURE_HEADER = "X-Webchat-Signature";

export type SessionData = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pageUrl: string | null;
  referrer: string | null;
  utm: Record<string, string | undefined>;
  consentAt: string | null;
  consentVersion: string | null;
  createdAt: string;
};

export type OutgoingMessage = {
  id: string;
  text: string;
  createdAt: string;
  attachment?: { url: string; mimeType: string; filename?: string } | null;
};

// Portuguese keys on purpose: they show up as-is in DataCrazy automations, configured by non-developers.
export function leadFields(session: SessionData, source: string) {
  return {
    contactId: session.id,
    nome: session.name,
    email: session.email ?? "",
    telefone: session.phone ? formatPhone(session.phone) : "",
    telefoneNumeros: session.phone ?? "",
    origem: source,
    paginaOrigem: session.pageUrl ?? "",
    referrer: session.referrer ?? "",
    utm_source: session.utm.source ?? "",
    utm_medium: session.utm.medium ?? "",
    utm_campaign: session.utm.campaign ?? "",
    utm_content: session.utm.content ?? "",
    utm_term: session.utm.term ?? "",
    consentimentoVersao: session.consentVersion ?? "",
    consentimentoEm: session.consentAt ?? "",
    criadoEm: session.createdAt,
  };
}

export function buildMessagePayload(session: SessionData, message: OutgoingMessage, source: string) {
  const attachment = message.attachment ? { url: message.attachment.url, mimeType: message.attachment.mimeType } : undefined;
  return {
    event: "message",
    message: {
      id: `msg_${message.id}`,
      // Attachment-only messages carry the file name so the inbox never shows an empty bubble.
      text: message.text || (message.attachment?.filename ?? ""),
      timestamp: Math.floor(Date.parse(message.createdAt) / 1000),
      ...(attachment ? { attachment } : {}),
    },
    contact: { id: session.id, name: session.name, isAgent: false },
    // Not mapped by the connection, but it reaches "Mensagem Recebida" automations untouched.
    lead: leadFields(session, source),
  };
}

export function buildLeadPayload(session: SessionData, source: string) {
  return { evento: "webchat_formulario", ...leadFields(session, source) };
}

// Webhook URLs come from the panel, but the server POSTs to them: only DataCrazy hosts over HTTPS, so a
// stolen admin session can't turn the app into a proxy to internal addresses (SSRF). Local hosts are
// allowed outside production, for local testing.
export function isAllowedWebhookUrl(value: string, production = process.env.NODE_ENV === "production"): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:" && (url.hostname === "datacrazy.io" || url.hostname.endsWith(".datacrazy.io"))) return true;
    return !production && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  } catch {
    return false;
  }
}

export type PostResult = { ok: true; status: number } | { ok: false; status: number; error: string; retryable: boolean };

// DataCrazy answers 200 {"success":true} even when it discards a message, so "ok" here only means
// "accepted for processing". Network errors, 5xx and 429 are retryable; other 4xx are not.
export async function postSigned(url: string, secret: string, payload: unknown, fetchImpl: typeof fetch = fetch): Promise<PostResult> {
  if (!isAllowedWebhookUrl(url))
    return { ok: false, status: 0, error: "URL de webhook fora do DataCrazy (precisa ser https://….datacrazy.io).", retryable: false };
  const body = JSON.stringify(payload);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", [SIGNATURE_HEADER]: webhookSignature(secret, body) },
      body,
      signal: AbortSignal.timeout(15_000),
      // A redirect could point anywhere: treat it as an error instead of following it.
      redirect: "manual",
    });
    if (response.ok) return { ok: true, status: response.status };
    const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, error: `HTTP ${response.status} ${text.slice(0, 200)}`.trim(), retryable };
  } catch (error) {
    return { ok: false, status: 0, error: `Falha de rede: ${(error as Error).message}`, retryable: true };
  }
}

// Backoff for rescheduled deliveries: 30s, 2min, 10min, 30min, 2h, then every 6h, giving up after ~2 days.
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200];
export const MAX_DELIVERY_ATTEMPTS = 12;

export function nextAttemptAt(attempts: number, now = Date.now()): Date | null {
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  const seconds = BACKOFF_SECONDS[attempts - 1] ?? 6 * 3600;
  return new Date(now + seconds * 1000);
}
