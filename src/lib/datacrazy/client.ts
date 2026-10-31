// REST client for https://api.g1.datacrazy.io. Kept free of "server-only" and DB imports so it can be
// unit-tested; the caller injects the rate limiter.

export const DATACRAZY_API_BASE = "https://api.g1.datacrazy.io";

export class DataCrazyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export type ClientOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  // Shared budget across every instance (DataCrazy limits per account). Returns false when exhausted.
  acquire?: () => Promise<boolean>;
  maxRetries?: number;
  baseUrl?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
// Never wait longer than this inside a request: beyond it the job is rescheduled instead.
const MAX_INLINE_WAIT_MS = 30_000;

export function retryAfterMs(header: string | null, attempt: number): number {
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = header ? Date.parse(header) : NaN;
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return Math.min(1000 * 2 ** attempt, 8000);
}

// Conversation responses embed the connection config in plain text (token, HMAC secret).
// Strip it from anything we keep or log.
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (key === "config" || key === "credentials" || /token|secret|password|apikey/i.test(key)) continue;
      out[key] = redact(inner);
    }
    return out as T;
  }
  return value;
}

export class DataCrazyClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseUrl = options.baseUrl ?? DATACRAZY_API_BASE;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (this.options.acquire && !(await this.options.acquire())) {
        throw new DataCrazyApiError("Limite de chamadas à API do DataCrazy atingido; tentaremos de novo em instantes.", 429, 60);
      }

      let response: Response;
      try {
        response = await this.fetchImpl(this.baseUrl + path, {
          method,
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (attempt >= this.maxRetries) throw new DataCrazyApiError(`Falha de rede: ${(error as Error).message}`, 0);
        await this.sleep(retryAfterMs(null, attempt));
        continue;
      }

      if (response.ok) {
        const text = await response.text();
        return (text ? JSON.parse(text) : null) as T;
      }

      const wait = retryAfterMs(response.headers.get("retry-after"), attempt);
      if (RETRYABLE.has(response.status) && attempt < this.maxRetries && wait <= MAX_INLINE_WAIT_MS) {
        await this.sleep(wait);
        continue;
      }
      throw new DataCrazyApiError(await describeError(response), response.status, Math.ceil(wait / 1000));
    }
  }

  listInstances() {
    return this.request<{ count: number; data: DcInstance[] }>("GET", "/api/v1/instances").then(redact);
  }

  findConversations(search: string, instanceId?: string) {
    const params = new URLSearchParams({ search, take: "20" });
    if (instanceId) params.set("filter[instances]", instanceId);
    return this.request<{ count: number; data: DcConversation[] }>("GET", `/api/v1/conversations?${params}`).then(redact);
  }

  searchLeads(search: string, searchType: "name" | "email" | "phone") {
    const params = new URLSearchParams({ search, searchType, take: "20" });
    return this.request<{ count: number; data: DcLead[] }>("GET", `/api/v1/leads?${params}`).then(redact);
  }

  addInternalNote(conversationId: string, body: string) {
    return this.request<{ id?: string }>("POST", `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      body,
      isInternal: true,
    });
  }
}

async function describeError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  let detail = "";
  try {
    const json = JSON.parse(text) as { message?: unknown };
    detail = Array.isArray(json.message) ? json.message.join("; ") : String(json.message ?? "");
  } catch {
    detail = text.slice(0, 200);
  }
  if (response.status === 401) return "API key do DataCrazy inválida (confira se copiou com o prefixo dc_).";
  if (response.status === 403) return "A API key não tem permissão para esta operação.";
  if (response.status === 429) return "Limite de chamadas à API do DataCrazy atingido.";
  return `DataCrazy respondeu ${response.status}${detail ? `: ${detail}` : ""}`;
}

export type DcInstance = {
  id: string;
  name: string;
  platform?: string;
  provider?: string;
  isActive?: boolean;
  status?: string;
  webhook?: string;
};
export type DcConversation = { id: string; name?: string; contact?: { contactId?: string; name?: string }; finished?: boolean };
export type DcLead = { id: string; name?: string; email?: string; phone?: string; contacts?: { contactId?: string; platform?: string }[] };
