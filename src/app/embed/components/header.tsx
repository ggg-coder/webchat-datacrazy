"use client";

import { useState } from "react";
import type { PublicWidgetConfig } from "@/lib/widget/shared";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function Header({
  config,
  onClose,
  onNewConversation,
}: {
  config: PublicWidgetConfig;
  onClose: () => void;
  onNewConversation?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { appearance } = config;
  return (
    <header className="relative flex items-center gap-3 px-4 py-3" style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
      {appearance.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external avatar URL, inside a sandboxed iframe
        <img src={appearance.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white/20 object-cover" />
      ) : (
        <div aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-semibold">
          {initials(appearance.title)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold leading-tight">{appearance.title}</h1>
        <p className="flex items-center gap-1.5 truncate text-xs opacity-85">
          <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${config.isOpen ? "bg-emerald-400" : "bg-slate-300"}`} />
          {config.isOpen ? appearance.subtitle : "Fora do horário de atendimento"}
        </p>
      </div>
      {onNewConversation && (
        <div className="relative">
          <button
            type="button"
            aria-label="Mais opções"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 z-10 w-48 overflow-hidden rounded-lg bg-white py-1 text-sm text-slate-800 shadow-lg"
            >
              <button
                role="menuitem"
                type="button"
                className="block w-full px-4 py-2 text-left hover:bg-slate-100"
                onClick={() => {
                  setMenuOpen(false);
                  onNewConversation();
                }}
              >
                Iniciar nova conversa
              </button>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label="Fechar chat"
        onClick={onClose}
        className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </header>
  );
}
