"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, CopyValue, api } from "@/components/ui";

type SetupInfo = {
  env: Record<"supabaseUrl" | "supabaseServiceKey" | "supabaseAnonKey" | "databaseUrl" | "appSecret", boolean>;
  schema: { ready: boolean; error?: string };
  canMigrate: boolean;
};

const ENV_LABELS: { key: keyof SetupInfo["env"]; name: string; help: string; optional?: boolean }[] = [
  { key: "supabaseUrl", name: "SUPABASE_URL", help: "Endereço do projeto Supabase. Criado pela integração Supabase da Vercel." },
  { key: "supabaseServiceKey", name: "SUPABASE_SERVICE_ROLE_KEY", help: "Chave de serviço do Supabase (secreta)." },
  { key: "supabaseAnonKey", name: "SUPABASE_ANON_KEY", help: "Chave pública do Supabase, usada para entregar respostas em tempo real." },
  {
    key: "databaseUrl",
    name: "POSTGRES_URL_NON_POOLING",
    help: "Conexão direta com o banco. Permite criar as tabelas por este painel.",
    optional: true,
  },
  { key: "appSecret", name: "APP_SECRET", help: "Texto aleatório com 32+ caracteres. Protege cookies e a chave do DataCrazy." },
];

// 48 random bytes from the browser's CSPRNG, base64url (64 characters). Generated here, never sent
// to the server: the admin pastes it straight into Vercel.
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function SecretGenerator({ configured }: { configured: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <div className={`rounded-lg border p-4 text-sm ${configured ? "border-slate-200" : "border-amber-300 bg-amber-50"}`}>
      <p className="font-medium">Gerar APP_SECRET</p>
      <p className="mt-1 text-xs text-slate-600">
        {configured
          ? "Já configurado. Só gere outro se quiser trocar: depois da troca, a API key do DataCrazy e os segredos da conexão precisam ser cadastrados de novo."
          : "Gere um valor aleatório aqui (ele é criado no seu navegador e não é enviado a lugar nenhum), copie e cole na Vercel."}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {secret ? (
          <CopyValue value={secret} label="APP_SECRET" />
        ) : (
          <Button variant="secondary" className="w-fit" onClick={() => setSecret(randomSecret())}>
            Gerar valor aleatório
          </Button>
        )}
        {secret && (
          <ol className="list-decimal pl-5 text-xs text-slate-600">
            <li>
              Na Vercel: <strong>Settings → Environment Variables → Add</strong>. Nome <code>APP_SECRET</code>, valor copiado acima,
              ambiente Production (e Preview, se usar).
            </li>
            <li>
              <strong>Deployments → ⋯ → Redeploy</strong> para o valor valer.
            </li>
            <li>Guarde uma cópia num lugar seguro: sem ela, os dados criptografados não podem ser lidos.</li>
          </ol>
        )}
      </div>
    </div>
  );
}

export function SetupStatus({ onReady }: { onReady?: () => void }) {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let active = true;
    api<SetupInfo>("/api/admin/setup").then((result) => {
      if (!active) return;
      if (result.ok) setInfo(result);
      else setMessage({ tone: "error", text: result.error ?? "Falha ao consultar a instalação." });
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (info?.schema.ready) onReady?.();
  }, [info, onReady]);

  async function migrate() {
    setRunning(true);
    setMessage(null);
    const result = await api<{ applied: string[] }>("/api/admin/setup", { method: "POST" });
    setRunning(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error ?? "Falha ao criar as tabelas." });
    setMessage({
      tone: "success",
      text: result.applied.length ? `Tabelas criadas (${result.applied.join(", ")}).` : "As tabelas já existiam.",
    });
    setReloadKey((key) => key + 1);
  }

  if (!info) return <Card title="Verificando a instalação…">{message && <Alert tone={message.tone}>{message.text}</Alert>}</Card>;

  const missing = ENV_LABELS.filter((item) => !item.optional && !info.env[item.key]);

  // Everything in place: one line instead of the whole checklist.
  if (missing.length === 0 && info.schema.ready && !showDetails) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span>✓ Servidor e banco de dados prontos.</span>
        <button type="button" className="underline" onClick={() => setShowDetails(true)}>
          Detalhes
        </button>
      </div>
    );
  }

  return (
    <Card title="Instalação">
      <ul className="mb-4 flex flex-col gap-2 text-sm">
        {ENV_LABELS.map((item) => (
          <li key={item.key} className="flex gap-3">
            <span aria-hidden className={info.env[item.key] ? "text-emerald-600" : item.optional ? "text-slate-400" : "text-red-600"}>
              {info.env[item.key] ? "✓" : item.optional ? "○" : "✗"}
            </span>
            <span>
              <code className="font-mono text-xs font-semibold">{item.name}</code>
              {item.optional && <span className="text-slate-400"> (opcional)</span>}
              <span className="block text-slate-500">{item.help}</span>
            </span>
          </li>
        ))}
        <li className="flex gap-3">
          <span aria-hidden className={info.schema.ready ? "text-emerald-600" : "text-red-600"}>
            {info.schema.ready ? "✓" : "✗"}
          </span>
          <span>
            <strong>Tabelas no banco</strong>
            <span className="block text-slate-500">{info.schema.ready ? "Criadas." : "Ainda não foram criadas."}</span>
          </span>
        </li>
      </ul>

      {missing.length > 0 && (
        <Alert tone="warning">
          Configure {missing.map((item) => item.name).join(", ")} em <strong>Vercel → Settings → Environment Variables</strong> e faça um
          novo deploy (Deployments → ⋯ → Redeploy).
        </Alert>
      )}

      <div className="mb-4">
        <SecretGenerator configured={info.env.appSecret} />
      </div>

      {missing.length === 0 && !info.schema.ready && (
        <div className="flex flex-col gap-3">
          {info.canMigrate ? (
            <Button onClick={migrate} disabled={running} className="w-fit">
              {running ? "Criando tabelas…" : "Criar tabelas"}
            </Button>
          ) : (
            <Alert tone="info">
              Abra o <strong>SQL Editor</strong> do Supabase, cole o conteúdo de <code>supabase/migrations/0001_init.sql</code> e clique em{" "}
              <strong>Run</strong>. Depois recarregue esta página.
            </Alert>
          )}
        </div>
      )}

      {message && (
        <div className="mt-3">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
    </Card>
  );
}
