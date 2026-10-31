"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ALLOWED_UPLOAD_TYPES, MAX_TEXT_LENGTH } from "@/lib/widget/shared";

export function Composer({
  disabled,
  uploads,
  onSend,
  onAttach,
}: {
  disabled: boolean;
  uploads: { enabled: boolean; maxSizeMb: number };
  onSend: (text: string) => void;
  onAttach: (file: File) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function send() {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
    textRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-2">
      {uploads.enabled && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={ALLOWED_UPLOAD_TYPES.join(",")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onAttach(file);
            }}
          />
          <button
            type="button"
            aria-label={`Anexar arquivo (até ${uploads.maxSizeMb} MB)`}
            title={`Anexar arquivo (até ${uploads.maxSizeMb} MB)`}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-black/5 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        </>
      )}
      <label className="sr-only" htmlFor="dcwebchat-input">
        Escreva sua mensagem
      </label>
      <textarea
        id="dcwebchat-input"
        ref={textRef}
        rows={1}
        maxLength={MAX_TEXT_LENGTH}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Escreva sua mensagem…"
        className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-[var(--bubble)] px-4 py-2.5 text-sm text-[var(--text)] outline-none [field-sizing:content] placeholder:text-[var(--muted)]"
      />
      <button
        type="button"
        aria-label="Enviar mensagem"
        disabled={disabled || !text.trim()}
        onClick={send}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-40"
        style={{ background: "var(--brand)", color: "var(--on-brand)" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
        </svg>
      </button>
    </div>
  );
}
