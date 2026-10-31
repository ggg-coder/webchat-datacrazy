"use client";

import { useEffect, useState } from "react";
import { Alert, Card, CopyValue, SaveBar, Textarea, api } from "@/components/ui";
import { PageTitle } from "../admin-shell";
import { useSettings } from "../use-settings";

const ORIGIN_RE = /^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/i;

// "www.site.com.br/contato" → "https://www.site.com.br"
function toOrigin(line: string): string | null {
  const value = line.trim().replace(/\/+$/, "");
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme.replace("*.", "wildcard-placeholder."));
    const origin = url.origin.replace("wildcard-placeholder.", "*.");
    return ORIGIN_RE.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

const PLATFORMS: { name: string; steps: string }[] = [
  { name: "HTML puro", steps: "Cole o código antes de </body> em todas as páginas (ou no template comum)." },
  { name: "WordPress", steps: "Instale o plugin “WPCode” (ou similar) → Code Snippets → Header & Footer → cole no campo Footer → Salvar." },
  {
    name: "Wix",
    steps:
      "Configurações do site → Avançado → Código personalizado → + Adicionar código → cole, escolha “Todas as páginas” e “Body - fim”.",
  },
  { name: "Webflow", steps: "Site settings → Custom code → Footer code → cole → Save → Publish." },
  { name: "Shopify", steps: "Loja virtual → Temas → ⋯ → Editar código → layout/theme.liquid → cole antes de </body> → Salvar." },
  {
    name: "Google Tag Manager",
    steps: "Nova tag → HTML personalizado → cole o código → acionador “All Pages” → Salvar → Enviar/Publicar.",
  },
];

export default function InstallPage() {
  const settings = useSettings();
  const { config } = settings;
  const [baseUrl, setBaseUrl] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    api<{ baseUrl: string }>("/api/admin/connection").then((result) => active && result.ok && setBaseUrl(result.baseUrl));
    return () => {
      active = false;
    };
  }, []);

  if (!config) return <PageTitle title="Instalar no site" description="Carregando…" />;
  const value = text ?? config.security.allowedOrigins.join("\n");
  const snippet = `<script src="${baseUrl}/widget.js" async></script>`;

  async function save() {
    const lines = value.split(/\n|,/).filter((line) => line.trim());
    const origins = lines.map(toOrigin);
    const bad = lines.filter((_, index) => !origins[index]);
    setInvalid(bad);
    if (bad.length) return;
    const unique = [...new Set(origins as string[])];
    if (await settings.save({ security: { allowedOrigins: unique } })) setText(unique.join("\n"));
  }

  return (
    <>
      <PageTitle title="Instalar no site" />
      <div className="flex flex-col gap-6">
        <Card title="1. Endereços do seu site">
          <div className="flex flex-col gap-3">
            <Textarea
              label="Um endereço por linha"
              rows={4}
              placeholder={"https://www.seusite.com.br\nhttps://seusite.com.br"}
              value={value}
              onChange={(e) => setText(e.target.value)}
              hint="Só esses sites conseguem mostrar o chat. Inclua as versões com e sem www e o endereço de testes, se houver. Use *.seusite.com.br para todos os subdomínios."
            />
            {invalid.length > 0 && <Alert tone="error">Endereço inválido: {invalid.join(", ")}</Alert>}
            {config.security.allowedOrigins.length === 0 && (
              <Alert tone="warning">Nenhum endereço cadastrado: por enquanto qualquer site consegue mostrar o seu chat.</Alert>
            )}
            <SaveBar saving={settings.saving} message={settings.message} onSave={() => void save()} />
          </div>
        </Card>

        <Card title="2. Código para colar no site">
          <div className="flex flex-col gap-3 text-sm">
            <CopyValue value={snippet} label="código do chat" />
            <p className="text-xs text-slate-500">
              Opcional no &lt;script&gt;: <code>data-position=&quot;left&quot;</code>, <code>data-color=&quot;#ff6600&quot;</code>,{" "}
              <code>data-text=&quot;Fale conosco&quot;</code>, <code>data-open=&quot;5&quot;</code> (abre após 5 s).
            </p>
            <a href="/demo.html" target="_blank" rel="noopener noreferrer" className="w-fit text-sm underline">
              Ver o chat numa página de exemplo
            </a>
          </div>
        </Card>

        <Card title="Onde colar, por plataforma">
          <dl className="flex flex-col divide-y divide-slate-100 text-sm">
            {PLATFORMS.map((platform) => (
              <div key={platform.name} className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr]">
                <dt className="font-medium">{platform.name}</dt>
                <dd className="text-slate-600">{platform.steps}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Para desenvolvedores">
          <div className="flex flex-col gap-2 text-sm text-slate-600">
            <p>
              <code>window.DCWebchat.open()</code>, <code>.close()</code>, <code>.toggle()</code> e{" "}
              <code>.identify({"{ name, email, phone }"})</code>, que pula o formulário quando o site já sabe quem é o visitante.
            </p>
            <p>
              Eventos na página: <code>dcwebchat:open</code>, <code>dcwebchat:close</code> e <code>dcwebchat:lead</code> (formulário
              enviado; use para registrar conversões).
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
