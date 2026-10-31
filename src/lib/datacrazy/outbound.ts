// Request DataCrazy sends to POST /api/datacrazy/outbound when an agent replies (Universal Connection,
// "Envio" tab). Pure logic with injected dependencies so it can be unit-tested.
import { createHash } from "node:crypto";
import { z } from "zod";
import { safeEqual } from "@/lib/crypto";

export const outboundSchema = z.object({
  type: z.enum(["text", "attachment"]).catch("text"),
  visitorId: z.string().trim().min(1).max(200),
  text: z.string().max(20_000).catch(""),
  dcMessageId: z.string().trim().max(200).catch(""),
  attachment: z
    .object({
      url: z.string().trim().max(4000).catch(""),
      mimeType: z.string().trim().max(200).catch(""),
      filename: z.string().trim().max(500).catch(""),
    })
    .optional(),
});

export type OutboundPayload = z.infer<typeof outboundSchema>;

// Only ${message.body} and ${contact.name} are JSON-escaped by DataCrazy. ${attachment.*} may arrive raw
// (a filename with a quote breaks the JSON), so when JSON.parse fails we pull each field out by position,
// relying on the key order of the template shown in the panel.
export function salvageOutbound(raw: string): Record<string, unknown> | null {
  const str = (key: string) => raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
  const unescape = (value: string | undefined) => {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(`"${value}"`) as string;
    } catch {
      return value;
    }
  };
  const visitorId = str("visitorId");
  const dcMessageId = str("dcMessageId") ?? "";
  if (!visitorId) return null;

  const between = (start: string, end: string) => raw.match(new RegExp(`"${start}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"${end}"`))?.[1];
  const filename = raw.match(/"filename"\s*:\s*"([\s\S]*)"\s*}\s*}\s*$/)?.[1];
  const hasAttachment = /"attachment"\s*:/.test(raw);

  return {
    type: str("type") ?? (hasAttachment ? "attachment" : "text"),
    visitorId,
    dcMessageId,
    text: unescape(str("text")) ?? "",
    ...(hasAttachment
      ? { attachment: { url: between("url", "mimeType") ?? "", mimeType: between("mimeType", "filename") ?? "", filename: filename ?? "" } }
      : {}),
  };
}

// DataCrazy's editor doesn't list ${message.id} among the template variables. If it arrives empty or
// uninterpolated, derive an id from the content and a 2-minute window: an immediate resend is still
// deduplicated, and different replies never collapse into one.
export function effectiveMessageId(payload: OutboundPayload, now = Date.now()): { id: string; derived: boolean } {
  const raw = payload.dcMessageId;
  if (raw && !raw.includes("${")) return { id: raw, derived: false };
  const window = Math.floor(now / 120_000);
  const digest = createHash("sha256")
    .update([payload.visitorId, payload.text, payload.attachment?.url ?? "", window].join("|"))
    .digest("hex")
    .slice(0, 32);
  return { id: `derived_${digest}`, derived: true };
}

// What the logs keep of a raw request: its structure, never its content. Context-aware allow-list:
// known names survive only as keys, "text"/"attachment" only as the value of "type", MIME types only
// as the value of "mimeType", plus pure template variables (an uninterpolated "${message.id}").
// Everything else, including fragments of malformed JSON, becomes a placeholder.
const KNOWN_KEYS = new Set(["type", "visitorId", "text", "dcMessageId", "attachment", "url", "mimeType", "filename"]);
const PURE_VARIABLE = /^\$\{[A-Za-z.]+\}$/;
const MIME = /^(image|audio|video|application|text)\/[a-z0-9.+-]+$/i;

function allowedValue(key: string | null, value: string): boolean {
  if (PURE_VARIABLE.test(value)) return true;
  if (key === "type") return value === "text" || value === "attachment";
  if (key === "mimeType") return MIME.test(value);
  return false;
}

export function describeRaw(raw: string): string {
  let lastKey: string | null = null;
  return raw
    .replace(/"((?:[^"\\]|\\.)*)"(\s*:)?|[^{}[\]:,"\s]+/g, (match: string, quoted: string | undefined, colon: string | undefined) => {
      if (quoted === undefined) {
        lastKey = null;
        return "<?>";
      }
      if (colon) {
        lastKey = KNOWN_KEYS.has(quoted) ? quoted : null;
        return lastKey ? match : `"<chave>"${colon}`;
      }
      const keep = allowedValue(lastKey, quoted);
      lastKey = null;
      return keep ? match : `"<texto:${quoted.length}>"`;
    })
    .slice(0, 1000);
}

export type ParseResult = { ok: true; payload: OutboundPayload; salvaged: boolean } | { ok: false; error: string };

export function parseOutbound(raw: string): ParseResult {
  let json: unknown;
  let salvaged = false;
  try {
    json = JSON.parse(raw);
  } catch {
    json = salvageOutbound(raw);
    salvaged = true;
    if (!json) return { ok: false, error: "JSON inválido" };
  }
  const parsed = outboundSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: `Campos inválidos: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` };

  const payload = parsed.data;
  // Templates with no attachment variables interpolate to empty strings: treat as plain text.
  if (payload.attachment && !/^https?:\/\//i.test(payload.attachment.url)) delete payload.attachment;
  payload.type = payload.attachment ? "attachment" : "text";
  return { ok: true, payload, salvaged };
}

export type AgentMessage = {
  id: string;
  sessionId: string;
  text: string;
  attachment: { url: string; mimeType: string; filename: string } | null;
  createdAt: string;
};

export type OutboundDeps = {
  outboundToken: () => Promise<string>;
  sessionExists: (visitorId: string) => Promise<boolean>;
  // Inserts the message; if dcMessageId was already stored returns the existing row (idempotency).
  saveAgentMessage: (input: { sessionId: string; dcMessageId: string; text: string; attachment: AgentMessage["attachment"] }) => Promise<{
    message: AgentMessage;
    duplicate: boolean;
  }>;
  publish: (message: AgentMessage) => Promise<void>;
  log: (status: "ok" | "error", summary: Record<string, unknown>, error?: string, sessionId?: string) => Promise<void>;
};

export type OutboundResponse = { status: number; body: { ok: true; id: string } | { ok: false; error: string } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleOutbound(deps: OutboundDeps, authorization: string | null, raw: string): Promise<OutboundResponse> {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  const expected = await deps.outboundToken();
  if (!expected || !safeEqual(token, expected)) {
    await deps.log("error", { reason: "unauthorized" }, "Token inválido no outbound");
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }

  const parsed = parseOutbound(raw);
  if (!parsed.ok) {
    await deps.log("error", { reason: "invalid_body", shape: describeRaw(raw) }, parsed.error);
    return { status: 400, body: { ok: false, error: parsed.error } };
  }
  const { payload, salvaged } = parsed;

  // "Testar Conexão" sends fictitious data. Unknown contacts are logged and acknowledged so the test passes
  // and DataCrazy doesn't keep retrying messages for sessions that were deleted (LGPD).
  if (!UUID_RE.test(payload.visitorId) || !(await deps.sessionExists(payload.visitorId))) {
    // Shape only: shows what "Testar Conexão" sends without keeping text meant for deleted sessions.
    await deps.log("ok", { reason: "unknown_contact", shape: describeRaw(raw) });
    return { status: 200, body: { ok: true, id: `ignored_${effectiveMessageId(payload).id}` } };
  }

  const messageId = effectiveMessageId(payload);
  const { message, duplicate } = await deps.saveAgentMessage({
    sessionId: payload.visitorId,
    dcMessageId: messageId.id,
    text: payload.text,
    attachment: payload.attachment ?? null,
  });
  if (!duplicate) await deps.publish(message);
  await deps.log(
    "ok",
    {
      dcMessageId: messageId.id,
      derivedId: messageId.derived,
      type: payload.type,
      duplicate,
      salvaged,
      ...(salvaged || messageId.derived ? { shape: describeRaw(raw) } : {}),
    },
    undefined,
    payload.visitorId,
  );
  return { status: 200, body: { ok: true, id: message.id } };
}
