// Browser-side data layer of the widget: stored session, API calls, direct upload and Realtime.
import { RealtimeClient } from "@supabase/realtime-js";
import type { PublicWidgetConfig, StartSessionResponse, WidgetMessage } from "@/lib/widget/shared";

export type StoredSession = { token: string; sessionId: string; channel: string; name: string };

const STORAGE_KEY = "dcwebchat:session";

export const sessionStore = {
  read(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },
  save(session: StoredSession) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private mode / blocked storage: the conversation still works until the page is closed.
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
};

type ApiError = { ok: false; error: string; fields?: Record<string, string>; status: number };

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<(T & { ok: true }) | ApiError> {
  const { token, ...rest } = init;
  try {
    const response = await fetch(path, {
      ...rest,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...rest.headers },
    });
    if (response.status === 304) return { ok: true, notModified: true } as unknown as T & { ok: true };
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: body.error ?? "Não foi possível conectar. Verifique sua internet.",
        fields: body.fields,
        status: response.status,
      };
    }
    return { ...body, ok: true };
  } catch {
    return { ok: false, error: "Sem conexão. Verifique sua internet.", status: 0 };
  }
}

export const chatApi = {
  config: () => call<PublicWidgetConfig>("/api/widget/config"),
  checkSession: (token: string) => call<Omit<StoredSession, "token">>("/api/widget/session", { token }),
  startSession: (body: Record<string, unknown>) =>
    call<StartSessionResponse>("/api/widget/session", { method: "POST", body: JSON.stringify(body) }),
  history: (token: string, etag?: string) =>
    call<{ messages?: WidgetMessage[]; notModified?: boolean }>("/api/widget/messages", {
      token,
      headers: etag ? { "if-none-match": etag } : undefined,
    }),
  send: (token: string, body: { id: string; text: string; attachmentId?: string }) =>
    call<{ message: WidgetMessage }>("/api/widget/messages", { method: "POST", token, body: JSON.stringify(body) }),
  retry: (token: string, id: string) => call<object>(`/api/widget/messages/${id}/retry`, { method: "POST", token }),

  // Two steps: ask our API for a signed URL, then PUT the file straight into Supabase Storage.
  async upload(token: string, file: File): Promise<{ ok: true; attachmentId: string } | ApiError> {
    const mimeType = file.type || guessMime(file.name);
    const prepared = await call<{ attachmentId: string; uploadUrl: string }>("/api/widget/upload", {
      method: "POST",
      token,
      body: JSON.stringify({ filename: file.name, mimeType, size: file.size }),
    });
    if (!prepared.ok) return prepared;
    try {
      const response = await fetch(prepared.uploadUrl, { method: "PUT", body: file, headers: { "content-type": mimeType } });
      if (!response.ok) return { ok: false, error: "Falha ao enviar o arquivo. Tente de novo.", status: response.status };
    } catch {
      return { ok: false, error: "Falha ao enviar o arquivo. Verifique sua internet.", status: 0 };
    }
    return { ok: true, attachmentId: prepared.attachmentId };
  },
};

// Some systems don't report the type of .doc/.docx/.csv files in the file picker.
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function guessMime(filename: string): string {
  return MIME_BY_EXTENSION[filename.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export type LiveEvent = { type: "message"; message: WidgetMessage } | { type: "status"; id: string; status: WidgetMessage["status"] };

// Broadcast subscription on the session's private channel name. When the socket is not joined,
// the caller falls back to polling GET /api/widget/messages.
export function subscribe(
  config: PublicWidgetConfig["realtime"],
  channelName: string,
  onEvent: (event: LiveEvent) => void,
  onStatus: (live: boolean) => void,
) {
  if (!config) {
    onStatus(false);
    return () => {};
  }
  const client = new RealtimeClient(`${config.url.replace(/\/+$/, "")}/realtime/v1`, { params: { apikey: config.key } });
  const channel = client
    .channel(channelName, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "message" }, ({ payload }) => onEvent({ type: "message", message: payload as WidgetMessage }))
    .on("broadcast", { event: "status" }, ({ payload }) =>
      onEvent({ type: "status", ...(payload as { id: string; status: WidgetMessage["status"] }) }),
    )
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
  return () => {
    void channel.unsubscribe();
    void client.disconnect();
  };
}
