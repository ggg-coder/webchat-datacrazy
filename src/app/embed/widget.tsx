"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { normalizePhone } from "@/lib/phone";
import type { PublicWidgetConfig, WidgetMessage } from "@/lib/widget/shared";
import { chatApi, sessionStore, subscribe, type StoredSession } from "./chat-client";
import { Composer } from "./components/composer";
import { Header } from "./components/header";
import { PreChatForm, type FormValues } from "./components/pre-chat-form";
import { Thread, type ThreadMessage } from "./components/thread";

const SOURCE = "dcwebchat";
const POLL_FALLBACK_MS = 4000;
const POLL_SAFETY_MS = 30000;

type Phase = "loading" | "unavailable" | "form" | "chat";
type HostContext = { host: string | null; page: string; referrer: string; utm: Record<string, string>; testToken?: string };

function readHostContext(): HostContext {
  const params = new URLSearchParams(window.location.hash.slice(1));
  let host: string | null = null;
  try {
    const origin = params.get("host");
    host = origin ? new URL(origin).origin : null;
  } catch {}
  const utm: Record<string, string> = {};
  for (const key of ["source", "medium", "campaign", "content", "term"]) {
    const value = params.get(`utm_${key}`);
    if (value) utm[key] = value;
  }
  return { host, page: params.get("page") ?? "", referrer: params.get("ref") ?? "", utm, testToken: params.get("test") ?? undefined };
}

const PALETTES = {
  light: {
    "--bg": "#f8fafc",
    "--surface": "#ffffff",
    "--bubble": "#f1f5f9",
    "--text": "#0f172a",
    "--muted": "#64748b",
    "--border": "#e2e8f0",
  },
  dark: {
    "--bg": "#020617",
    "--surface": "#0f172a",
    "--bubble": "#1e293b",
    "--text": "#e2e8f0",
    "--muted": "#94a3b8",
    "--border": "#334155",
  },
};

// Short two-tone chime, generated so no audio file has to be loaded.
function chime() {
  try {
    const context = new AudioContext();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.12 + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.12);
      oscillator.stop(context.currentTime + index * 0.12 + 0.3);
    });
  } catch {}
}

function mergeMessages(current: ThreadMessage[], incoming: WidgetMessage[]): ThreadMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message, local: false });
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function Widget() {
  const [context] = useState<HostContext | null>(() => (typeof window === "undefined" ? null : readHostContext()));
  const [config, setConfig] = useState<PublicWidgetConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [live, setLive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string | null; fields: Record<string, string> }>({ message: null, fields: {} });
  const [notice, setNotice] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(false);

  const panelOpen = useRef(false);
  const unread = useRef(0);
  const etag = useRef<string | undefined>(undefined);
  const known = useRef(new Set<string>());

  const toParent = useCallback(
    (message: Record<string, unknown>) => {
      if (context?.host && window.parent !== window) window.parent.postMessage({ source: SOURCE, ...message }, context.host);
    },
    [context],
  );

  // An agent message the visitor hasn't seen: badge on the launcher and a chime.
  const notifyIncoming = useCallback(
    (incoming: WidgetMessage[]) => {
      const fresh = incoming.filter((message) => message.author === "agent" && !known.current.has(message.id));
      for (const message of incoming) known.current.add(message.id);
      if (!fresh.length) return;
      if (!panelOpen.current || document.hidden) {
        unread.current += fresh.length;
        toParent({ type: "unread", count: unread.current });
        chime();
      }
    },
    [toParent],
  );

  const startChat = useCallback((stored: StoredSession) => {
    sessionStore.save(stored);
    setSession(stored);
    setPhase("chat");
  }, []);

  // Boot: configuration, then the stored session (if it still exists on the server).
  useEffect(() => {
    let active = true;
    (async () => {
      const result = await chatApi.config();
      if (!active) return;
      if (!result.ok) return setPhase("unavailable");
      setConfig(result);
      const stored = sessionStore.read();
      if (stored) {
        const check = await chatApi.checkSession(stored.token);
        if (!active) return;
        if (check.ok) return startChat({ ...stored, channel: check.channel, name: check.name });
        if (check.status === 401) sessionStore.clear();
      }
      setPhase("form");
    })();
    return () => {
      active = false;
    };
  }, [startChat]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    const result = await chatApi.history(session.token, etag.current);
    if (!result.ok) {
      // Session deleted (retention or "delete my data"): back to the form.
      if (result.status === 401) {
        sessionStore.clear();
        setSession(null);
        setMessages([]);
        setPhase("form");
      }
      return;
    }
    if (result.notModified || !result.messages) return;
    notifyIncoming(result.messages);
    setMessages((current) =>
      mergeMessages(
        current.filter((m) => m.local),
        result.messages!,
      ),
    );
  }, [session, notifyIncoming]);

  useEffect(() => {
    if (!session) return;
    etag.current = undefined;
    void refresh();
  }, [session, refresh]);

  // Realtime when available; polling otherwise, plus a slow safety refresh either way.
  useEffect(() => {
    if (!session || !config) return;
    const unsubscribe = subscribe(
      config.realtime,
      session.channel,
      // Broadcast channels are public (unguessable, not authenticated): an event only means "something
      // changed", and the content always comes from our API with the session token.
      () => void refresh(),
      setLive,
    );
    return unsubscribe;
  }, [session, config, refresh]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => void refresh(), live ? POLL_SAFETY_MS : POLL_FALLBACK_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, live, refresh]);

  const createSession = useCallback(
    async (values: Partial<FormValues> & { identified?: boolean }) => {
      if (!context) return;
      setSubmitting(true);
      setFormError({ message: null, fields: {} });
      const result = await chatApi.startSession({
        name: values.name ?? "",
        email: values.email ?? "",
        phone: values.phone ?? "",
        consent: values.consent ?? false,
        website: values.website ?? "",
        identified: values.identified ?? false,
        pageUrl: context.page,
        referrer: context.referrer,
        utm: context.utm,
        testToken: context.testToken,
      });
      setSubmitting(false);
      if (!result.ok) return setFormError({ message: result.error, fields: result.fields ?? {} });
      toParent({ type: "lead" });
      startChat({ token: result.token, sessionId: result.sessionId, channel: result.channel, name: result.name });
    },
    [context, startChat, toParent],
  );

  // Messages from the host page (widget.js). Only its exact origin is trusted.
  useEffect(() => {
    if (!context?.host) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== context.host || event.data?.source !== SOURCE) return;
      if (event.data.type === "open") {
        panelOpen.current = true;
        unread.current = 0;
        document.getElementById("dcwebchat-input")?.focus();
      } else if (event.data.type === "close") {
        panelOpen.current = false;
      } else if (event.data.type === "identify" && config && phase === "form") {
        // DCWebchat.identify(): skip the form when the site already knows who the visitor is.
        const data = event.data.data as { name?: string; email?: string; phone?: string };
        const phone = data.phone ? normalizePhone(data.phone) : null;
        const hasName = (data.name ?? "").trim().length >= 2 || config.form.name === "optional";
        const hasEmail = Boolean(data.email) || config.form.email !== "required";
        const hasPhone = Boolean(phone) || config.form.phone !== "required";
        if (hasName && hasEmail && hasPhone) void createSession({ ...data, phone: phone ?? "", identified: true });
      }
    };
    window.addEventListener("message", onMessage);
    toParent({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [context, config, phase, createSession, toParent]);

  const sendMessage = useCallback(
    async (input: { id?: string; text: string; attachmentId?: string; attachment?: ThreadMessage["attachment"] }) => {
      if (!session) return;
      const id = input.id ?? crypto.randomUUID();
      const draft: ThreadMessage = {
        id,
        author: "visitor",
        text: input.text,
        attachment: input.attachment ?? null,
        status: "sending",
        createdAt: new Date().toISOString(),
        local: true,
      };
      setMessages((current) =>
        mergeMessages(
          current.filter((m) => m.id !== id),
          [],
        ).concat(draft),
      );
      const result = await chatApi.send(session.token, { id, text: input.text, attachmentId: input.attachmentId });
      if (result.ok) {
        known.current.add(result.message.id);
        setMessages((current) => mergeMessages(current, [result.message]));
      } else {
        // Kept locally with the same id, so "tentar de novo" can't create a duplicate.
        setMessages((current) => current.map((m) => (m.id === id ? { ...m, status: "failed" } : m)));
        if (result.status === 429) setNotice(result.error);
      }
    },
    [session],
  );

  const retry = useCallback(
    async (id: string) => {
      const message = messages.find((m) => m.id === id);
      if (!message || !session) return;
      if (message.local) return sendMessage({ id, text: message.text });
      setMessages((current) => current.map((m) => (m.id === id ? { ...m, status: "sending" } : m)));
      await chatApi.retry(session.token, id);
    },
    [messages, session, sendMessage],
  );

  const attach = useCallback(
    async (file: File) => {
      if (!session || !config) return;
      if (file.size > config.uploads.maxSizeMb * 1024 * 1024) return setNotice(`Arquivo maior que ${config.uploads.maxSizeMb} MB.`);
      setNotice("Enviando arquivo…");
      const uploaded = await chatApi.upload(session.token, file);
      if (!uploaded.ok) return setNotice(uploaded.error);
      setNotice(null);
      await sendMessage({
        text: "",
        attachmentId: uploaded.attachmentId,
        attachment: { url: URL.createObjectURL(file), mimeType: file.type, filename: file.name },
      });
    },
    [session, config, sendMessage],
  );

  const newConversation = useCallback(() => {
    sessionStore.clear();
    setSession(null);
    setMessages([]);
    known.current.clear();
    setPhase("form");
  }, []);

  const style = useMemo(() => {
    const theme = config?.appearance.theme === "auto" ? (systemDark ? "dark" : "light") : (config?.appearance.theme ?? "light");
    return {
      ...PALETTES[theme],
      "--brand": config?.appearance.primaryColor ?? "#2563eb",
      "--on-brand": config?.appearance.textOnPrimary ?? "#ffffff",
    } as unknown as CSSProperties;
  }, [config, systemDark]);

  const close = () => toParent({ type: "close" });

  if (phase === "loading" || !config) {
    return (
      <div style={style} className="flex h-dvh items-center justify-center bg-[var(--surface)] text-sm text-[var(--muted)]">
        {phase === "unavailable" ? "Chat indisponível no momento. Tente mais tarde." : "Carregando…"}
      </div>
    );
  }

  const offlineNotice = config.isOpen ? null : config.appearance.offlineMessage;

  return (
    <div style={style} className="flex h-dvh flex-col bg-[var(--surface)] text-[var(--text)]">
      <Header config={config} onClose={close} onNewConversation={phase === "chat" ? newConversation : undefined} />
      {phase === "form" ? (
        <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
          {config.appearance.welcomeMessage && (
            <p className="mx-4 mt-4 whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--bubble)] px-3 py-2 text-sm">
              {config.appearance.welcomeMessage}
            </p>
          )}
          {offlineNotice && <p className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{offlineNotice}</p>}
          <PreChatForm
            config={config}
            submitting={submitting}
            serverError={formError.message}
            serverFields={formError.fields}
            onSubmit={(values) => void createSession(values)}
          />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
            <Thread
              messages={messages}
              welcome={config.appearance.welcomeMessage}
              notice={notice ?? offlineNotice}
              agentLabel={config.companyName || config.appearance.title}
              onRetry={(id) => void retry(id)}
            />
          </div>
          <Composer
            disabled={!session}
            uploads={config.uploads}
            onSend={(text) => void sendMessage({ text })}
            onAttach={(file) => void attach(file)}
          />
        </>
      )}
    </div>
  );
}
