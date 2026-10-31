"use client";

import { useRef, useState } from "react";
import { Alert, Button, Card, Input, SaveBar, Select, Textarea } from "@/components/ui";
import type { WebchatConfig } from "@/lib/settings/schema";
import { PageTitle } from "../admin-shell";
import { useSection, useSettings } from "../use-settings";

type Appearance = WebchatConfig["appearance"];

// Crops the center square and resizes to 256×256 WebP in the browser before uploading.
async function cropAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao converter"))), "image/webp", 0.9),
  );
}

function Preview({ appearance }: { appearance: Appearance }) {
  const left = appearance.position === "left";
  const dark = appearance.theme === "dark";
  const brand = { background: appearance.primaryColor, color: appearance.textOnPrimary };
  return (
    <div className="relative h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_12px,#f8fafc_12px,#f8fafc_24px)]">
      <div
        className={`absolute bottom-20 ${left ? "left-4" : "right-4"} flex h-[400px] w-[300px] flex-col overflow-hidden rounded-2xl shadow-xl ${
          dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={brand}>
          {appearance.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded avatar
            <img src={appearance.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-xs font-semibold">
              {appearance.title.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appearance.title}</p>
            <p className="truncate text-xs opacity-85">{appearance.subtitle}</p>
          </div>
        </div>
        <div className={`flex flex-1 flex-col gap-2 p-3 text-sm ${dark ? "bg-slate-950" : "bg-slate-50"}`}>
          {appearance.welcomeMessage && (
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md px-3 py-2 ${dark ? "bg-slate-800" : "bg-slate-100"}`}>
              {appearance.welcomeMessage}
            </p>
          )}
          <p className="max-w-[85%] self-end rounded-2xl rounded-br-md px-3 py-2" style={brand}>
            Olá! Gostaria de um orçamento.
          </p>
        </div>
        <div className={`border-t px-3 py-2 text-xs ${dark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-400"}`}>
          Escreva sua mensagem…
        </div>
      </div>
      <div
        className={`absolute bottom-4 ${left ? "left-4" : "right-4"} flex h-14 min-w-14 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg`}
        style={brand}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {appearance.launcherText}
      </div>
    </div>
  );
}

export default function AppearancePage() {
  const settings = useSettings();
  const section = useSection(settings.config, "appearance");
  const appearance = section.value;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadAvatar(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await cropAvatar(file);
      const response = await fetch("/api/admin/avatar", { method: "POST", headers: { "content-type": "image/webp" }, body: blob });
      const result = (await response.json()) as { ok: boolean; url?: string; error?: string };
      if (!result.ok || !result.url) throw new Error(result.error ?? "Falha no envio.");
      section.update({ avatarUrl: result.url });
    } catch (error) {
      setUploadError((error as Error).message || "Não foi possível usar essa imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!appearance) return;
    if (await settings.save({ appearance })) section.reset();
  }

  if (!appearance) return <PageTitle title="Aparência" description="Carregando…" />;

  return (
    <>
      <PageTitle
        title="Aparência"
        description="As mudanças aparecem na prévia na hora; no site, depois de salvar (pode levar até 1 minuto)."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nome no topo do chat"
                maxLength={60}
                value={appearance.title}
                onChange={(e) => section.update({ title: e.target.value })}
              />
              <Input
                label="Subtítulo"
                maxLength={80}
                value={appearance.subtitle}
                onChange={(e) => section.update({ subtitle: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-700">Avatar</span>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadAvatar(file);
                  }}
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Enviando…" : appearance.avatarUrl ? "Trocar imagem" : "Enviar imagem"}
                </Button>
                {appearance.avatarUrl && (
                  <Button variant="secondary" onClick={() => section.update({ avatarUrl: "" })}>
                    Remover
                  </Button>
                )}
                <span className="text-xs text-slate-500">Recortada em quadrado automaticamente.</span>
              </div>
              {uploadError && <Alert tone="error">{uploadError}</Alert>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Cor principal</span>
                <input
                  type="color"
                  className="h-10 w-full cursor-pointer rounded-lg border border-slate-300"
                  value={appearance.primaryColor}
                  onChange={(e) => section.update({ primaryColor: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Cor do texto sobre a cor principal</span>
                <input
                  type="color"
                  className="h-10 w-full cursor-pointer rounded-lg border border-slate-300"
                  value={appearance.textOnPrimary}
                  onChange={(e) => section.update({ textOnPrimary: e.target.value })}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Posição"
                value={appearance.position}
                onChange={(e) => section.update({ position: e.target.value as Appearance["position"] })}
                options={[
                  { value: "right", label: "Direita" },
                  { value: "left", label: "Esquerda" },
                ]}
              />
              <Select
                label="Tema"
                value={appearance.theme}
                onChange={(e) => section.update({ theme: e.target.value as Appearance["theme"] })}
                options={[
                  { value: "light", label: "Claro" },
                  { value: "dark", label: "Escuro" },
                  { value: "auto", label: "Automático" },
                ]}
              />
              <Input
                label="Abrir sozinho após (s)"
                type="number"
                min={0}
                max={600}
                value={appearance.autoOpenSeconds}
                onChange={(e) => section.update({ autoOpenSeconds: Math.max(0, Number(e.target.value) || 0) })}
                hint="0 = não abre sozinho"
              />
            </div>

            <Input
              label="Texto do botão"
              maxLength={30}
              placeholder="Só o ícone"
              value={appearance.launcherText}
              onChange={(e) => section.update({ launcherText: e.target.value })}
            />
            <Textarea
              label="Mensagem de boas-vindas"
              maxLength={500}
              value={appearance.welcomeMessage}
              onChange={(e) => section.update({ welcomeMessage: e.target.value })}
            />
            <Textarea
              label="Mensagem fora do horário"
              maxLength={500}
              value={appearance.offlineMessage}
              onChange={(e) => section.update({ offlineMessage: e.target.value })}
              hint="Aparece quando o horário de atendimento está ligado e fechado."
            />
            <SaveBar saving={settings.saving} message={settings.message} onSave={() => void save()} />
          </div>
        </Card>
        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-2 text-sm font-medium text-slate-700">Prévia</p>
          <Preview appearance={appearance} />
        </div>
      </div>
    </>
  );
}
