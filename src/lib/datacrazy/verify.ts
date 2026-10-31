// Compares the Universal Connection saved in DataCrazy (GET /api/v1/instances/{id} → config) with what
// this app expects, field by field. Secrets are only compared, never returned.
import { safeEqual } from "@/lib/crypto";
import { SIGNATURE_HEADER } from "./webhook";

export const OUTBOUND_PATH = "/api/datacrazy/outbound";

export type Check = { tab: "Envio" | "Recebimento" | "Geral"; label: string; ok: boolean; hint?: string };

type Endpoint = { method?: string; path?: string; bodyTemplate?: string; attachmentTypes?: string[] };
export type UniversalConfig = {
  send?: {
    baseUrl?: string;
    endpoints?: { sendText?: Endpoint; additional?: Endpoint[] };
    responseMapping?: { messageId?: string; success?: string };
  };
  receive?: {
    enabled?: boolean;
    mapping?: Record<string, string | undefined>;
    validation?: { signatureHeader?: string; algorithm?: string; secret?: string };
    filters?: { requiredField?: string; ignoreSelfMessages?: string };
  };
  auth?: { type?: string; bearerTokenKey?: string };
  credentials?: Record<string, string | undefined>;
};

export type Expected = { baseUrl: string; outboundToken: string; webhookSecret: string };

const INVISIBLE = /[​-‍﻿ ]/;

// Fills the template variables with sample values and checks the result is the JSON we parse.
function templateProduces(template: string | undefined, fields: string[]): boolean {
  if (!template) return false;
  const sample = template.replace(/\$\{[^}]+\}/g, "x");
  try {
    const json = JSON.parse(sample) as Record<string, unknown>;
    return fields.every(
      (field) =>
        field.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], json) !== undefined,
    );
  } catch {
    return false;
  }
}

const EXPECTED_MAPPING: [string, string, string][] = [
  ["contactId", "contact.id", "Caminho do ID do Contato"],
  ["messageBody", "message.text", "Caminho do Corpo da Mensagem"],
  ["messageId", "message.id", "Caminho do ID da Mensagem"],
  ["contactName", "contact.name", "Caminho do Nome do Contato"],
  ["timestamp", "message.timestamp", "Caminho do Timestamp"],
  ["attachmentUrl", "message.attachment.url", "Caminho da URL do Anexo"],
  ["attachmentType", "message.attachment.mimeType", "Caminho do Tipo do Anexo"],
  ["fromMe", "contact.isAgent", "Caminho do From Me"],
];

export function verifyConnection(config: UniversalConfig, expected: Expected, platform?: string): Check[] {
  const checks: Check[] = [];
  const add = (tab: Check["tab"], label: string, ok: boolean, hint?: string) => checks.push({ tab, label, ok, ...(ok ? {} : { hint }) });
  const send = config.send ?? {};
  const text = send.endpoints?.sendText ?? {};
  const additional = send.endpoints?.additional ?? [];
  const receive = config.receive ?? {};

  add("Geral", "É uma Conexão Universal", platform === undefined || platform === "UNIVERSAL", "Escolha uma conexão do tipo Universal.");

  const baseUrl = (send.baseUrl ?? "").replace(/\/+$/, "");
  const local = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(baseUrl);
  add(
    "Envio",
    "URL Base",
    baseUrl === expected.baseUrl && !local,
    local ? `“${baseUrl}” não é acessível pelo DataCrazy. Use o endereço público deste app.` : `Deve ser ${expected.baseUrl}`,
  );
  add(
    "Envio",
    "Endpoint de texto: método e caminho",
    (text.method ?? "").toUpperCase() === "POST" && text.path === OUTBOUND_PATH,
    `Método POST, caminho ${OUTBOUND_PATH}`,
  );
  add(
    "Envio",
    "Template do Body (texto)",
    templateProduces(text.bodyTemplate, ["visitorId", "text", "dcMessageId"]),
    "Copie o template de texto do painel de novo.",
  );
  add("Envio", "Tipo de Autenticação: Bearer Token", config.auth?.type === "bearer", "Selecione Bearer Token.");

  const tokenKey = config.auth?.bearerTokenKey ?? "token";
  add("Envio", "Chave do Bearer Token", tokenKey === "token", "Use “token”.");
  const credential = config.credentials?.[tokenKey] ?? "";
  add(
    "Envio",
    "Credencial “token” (valor)",
    Boolean(credential) && safeEqual(credential, expected.outboundToken),
    "O valor não é o token gerado pelo painel. Copie de novo (botão Copiar) e salve.",
  );
  add(
    "Envio",
    "Mapeamento de Resposta",
    send.responseMapping?.messageId === "id" && send.responseMapping?.success === "ok",
    "ID da Mensagem = id, Sucesso = ok",
  );

  const attachments = additional.find((endpoint) => endpoint.attachmentTypes?.includes("ALL"));
  add(
    "Envio",
    "Endpoint adicional de anexos (Todos)",
    Boolean(attachments) &&
      attachments!.path === OUTBOUND_PATH &&
      templateProduces(attachments!.bodyTemplate, [
        "visitorId",
        "dcMessageId",
        "attachment.url",
        "attachment.mimeType",
        "attachment.filename",
      ]),
    "Adicione um endpoint com Tipos de Anexo “Todos”, caminho e template de anexos do painel.",
  );

  add("Recebimento", "Recebimento habilitado", receive.enabled === true, "Ligue “Habilitar recebimento de mensagens”.");
  for (const [key, value, label] of EXPECTED_MAPPING) {
    add("Recebimento", label, receive.mapping?.[key] === value, `Deve ser ${value}`);
  }

  const header = receive.validation?.signatureHeader ?? "";
  add(
    "Recebimento",
    "Header de Assinatura",
    header === SIGNATURE_HEADER,
    INVISIBLE.test(header)
      ? "Tem caracteres invisíveis (texto colado). Apague e digite X-Webchat-Signature."
      : `Deve ser ${SIGNATURE_HEADER}`,
  );
  add("Recebimento", "Algoritmo", receive.validation?.algorithm === "hmac-sha256", "Selecione hmac-sha256.");
  // Empty "Segredo de Validação" makes DataCrazy fall back to the "webhookSecret" credential.
  const secret = receive.validation?.secret || config.credentials?.webhookSecret || "";
  add(
    "Recebimento",
    "Segredo de Validação",
    Boolean(secret) && safeEqual(secret, expected.webhookSecret),
    "O valor não é o segredo gerado pelo painel. Copie de novo e salve.",
  );
  add("Recebimento", "Filtro: Campo Obrigatório", receive.filters?.requiredField === "message.id", "Deve ser message.id");
  add(
    "Recebimento",
    "Filtro: Ignorar Mensagens Próprias",
    receive.filters?.ignoreSelfMessages === "contact.isAgent",
    "Deve ser contact.isAgent",
  );
  return checks;
}
