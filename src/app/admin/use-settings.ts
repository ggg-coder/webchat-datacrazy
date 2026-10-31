"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/ui";
import type { WebchatConfig } from "@/lib/settings/schema";

type Message = { tone: "success" | "error"; text: string } | null;

// Loads the settings once and saves one or more sections at a time.
export function useSettings() {
  const [config, setConfig] = useState<WebchatConfig | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api<{ config: WebchatConfig; hasApiKey: boolean }>("/api/admin/settings").then((result) => {
      if (!active) return;
      if (result.ok) {
        setConfig(result.config);
        setHasApiKey(result.hasApiKey);
      } else setMessage({ tone: "error", text: result.error ?? "Não foi possível carregar as configurações." });
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const save = useCallback(async (patch: Partial<WebchatConfig> & { setupCompleted?: boolean }) => {
    setSaving(true);
    setMessage(null);
    const result = await api<{ config: WebchatConfig }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(patch) });
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error ?? "Não foi possível salvar." });
      return false;
    }
    setConfig(result.config);
    setMessage({ tone: "success", text: "Salvo." });
    return true;
  }, []);

  return { config, setConfig, hasApiKey, setHasApiKey, saving, message, setMessage, save, reload: () => setReloadKey((key) => key + 1) };
}

// Edits one section locally until "Salvar".
export function useSection<K extends Exclude<keyof WebchatConfig, "setupCompletedAt">>(config: WebchatConfig | null, key: K) {
  const [draft, setDraft] = useState<WebchatConfig[K] | null>(null);
  const value = draft ?? config?.[key] ?? null;
  const update = (patch: Partial<WebchatConfig[K]>) => setDraft({ ...(value as object), ...patch } as WebchatConfig[K]);
  return { value, update, dirty: draft !== null, reset: () => setDraft(null) };
}
