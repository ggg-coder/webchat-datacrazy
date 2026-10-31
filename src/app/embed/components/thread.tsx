"use client";

import { useEffect, useRef } from "react";
import type { WidgetMessage } from "@/lib/widget/shared";
import { Linkified } from "./linkify";

export type ThreadMessage = WidgetMessage & { local?: boolean };

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Attachment({ attachment, mine }: { attachment: NonNullable<WidgetMessage["attachment"]>; mine: boolean }) {
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- user attachment served from /files or DataCrazy's CDN */}
        <img src={attachment.url} alt={attachment.filename} className="max-h-60 w-full rounded-lg object-cover" loading="lazy" />
      </a>
    );
  }
  if (attachment.mimeType.startsWith("audio/")) {
    return <audio controls src={attachment.url} className="w-56 max-w-full" preload="none" />;
  }
  if (attachment.mimeType.startsWith("video/")) {
    return <video controls src={attachment.url} className="max-h-60 w-full rounded-lg" preload="metadata" />;
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${mine ? "bg-white/15" : "bg-black/5"}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span className="truncate underline underline-offset-2">{attachment.filename}</span>
    </a>
  );
}

function Status({ message, onRetry }: { message: ThreadMessage; onRetry: (id: string) => void }) {
  if (message.status === "failed") {
    return (
      <button type="button" onClick={() => onRetry(message.id)} className="font-medium text-red-600 underline">
        Não enviada · tentar de novo
      </button>
    );
  }
  return <span>{message.status === "sending" ? "Enviando…" : "Enviada"}</span>;
}

export function Thread({
  messages,
  welcome,
  notice,
  agentLabel,
  onRetry,
}: {
  messages: ThreadMessage[];
  welcome: string;
  notice: string | null;
  agentLabel: string;
  onRetry: (id: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-4" role="log" aria-live="polite" aria-label="Mensagens">
      {notice && <p className="mx-auto max-w-[90%] rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">{notice}</p>}
      {welcome && (
        <div className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--bubble)] px-3 py-2 text-sm text-[var(--text)]">
          {welcome}
        </div>
      )}
      {messages.map((message, index) => {
        const mine = message.author === "visitor";
        const previous = messages[index - 1];
        const showAgentLabel = message.author === "agent" && previous?.author !== "agent";
        return (
          <div key={message.id} className={`flex max-w-[85%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}>
            {showAgentLabel && <span className="px-1 text-[11px] font-medium text-[var(--muted)]">{agentLabel} respondeu</span>}
            <div
              className={`flex flex-col gap-2 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                mine ? "rounded-br-md" : "rounded-bl-md bg-[var(--bubble)] text-[var(--text)]"
              }`}
              style={mine ? { background: "var(--brand)", color: "var(--on-brand)" } : undefined}
            >
              {message.attachment && <Attachment attachment={message.attachment} mine={mine} />}
              {message.text && message.text !== message.attachment?.filename && <Linkified text={message.text} />}
            </div>
            <span className="px-1 text-[11px] text-[var(--muted)]">
              {time(message.createdAt)}
              {mine && (
                <>
                  {" · "}
                  <Status message={message} onRetry={onRetry} />
                </>
              )}
            </span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
