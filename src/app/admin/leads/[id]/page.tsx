"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Card, api } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { PageTitle } from "../../admin-shell";

type Detail = {
  session: Record<string, unknown> & {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    utm: Record<string, string>;
    lead_webhook_status: string;
    lead_webhook_error: string | null;
    note_status: string;
    note_error: string | null;
  };
  messages: {
    id: string;
    author: string;
    text: string;
    createdAt: string;
    attachment: { url: string; filename: string } | null;
    deliveryStatus: string | null;
    lastError: string | null;
  }[];
  logs: { kind: string; status: string; error: string | null; created_at: string }[];
};

const STATUS_LABEL: Record<string, string> = { ok: "enviado", pending: "pendente", failed: "falhou", skipped: "não configurado" };
const dateTime = (value: unknown) =>
  typeof value === "string" && value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="break-words text-sm">{children || "—"}</dd>
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api<Detail>(`/api/admin/leads/${id}`).then((result) => {
      if (!active) return;
      if (result.ok) setData(result);
      else setError(result.error ?? "Lead não encontrado.");
    });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  async function retry(target: "lead" | "note" | "messages") {
    setNotice("Tentando de novo…");
    const result = await api(`/api/admin/leads/${id}/retry`, { method: "POST", body: JSON.stringify({ target }) });
    setNotice(result.ok ? "Pronto. Veja o status atualizado abaixo." : (result.error ?? "Falhou."));
    setReloadKey((key) => key + 1);
  }

  async function remove() {
    if (!data) return;
    const confirmed = window.confirm(
      `Apagar todos os dados de ${data.session.name} guardados aqui (formulário, mensagens e arquivos)? Isso não pode ser desfeito e não apaga nada no DataCrazy.`,
    );
    if (!confirmed) return;
    const result = await api(`/api/admin/leads/${id}`, { method: "DELETE" });
    if (result.ok) router.replace("/admin/leads");
    else setNotice(result.error ?? "Não foi possível apagar.");
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <PageTitle title="Lead" description="Carregando…" />;
  const { session } = data;
  const utm = Object.entries(session.utm ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  const undelivered = data.messages.some((message) => message.author === "visitor" && message.deliveryStatus !== "sent");

  return (
    <>
      <Link href="/admin/leads" className="mb-2 inline-block text-sm text-slate-500 underline">
        ← Leads
      </Link>
      <PageTitle title={session.name} description={`Formulário enviado em ${dateTime(session.created_at)}`} />
      {notice && (
        <div className="mb-4">
          <Alert tone="info">{notice}</Alert>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <Card title="Dados do formulário">
          <dl>
            <Field label="E-mail">{session.email}</Field>
            <Field label="Telefone">{session.phone ? formatPhone(session.phone) : ""}</Field>
            <Field label="Página de origem">{session.page_url as string}</Field>
            <Field label="Veio de">{session.referrer as string}</Field>
            <Field label="UTMs">{utm}</Field>
            <Field label="Navegador">{session.user_agent as string}</Field>
            <Field label="Consentimento LGPD">
              {session.consent_version ? `versão ${session.consent_version} em ${dateTime(session.consent_at)}` : ""}
              {typeof session.consent_text === "string" && <span className="block text-xs text-slate-500">“{session.consent_text}”</span>}
            </Field>
            <Field label="ID do contato no DataCrazy">
              <code className="text-xs">{session.id}</code>
            </Field>
          </dl>
        </Card>

        <Card title="Integração com o DataCrazy">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Automação de lead: <strong>{STATUS_LABEL[session.lead_webhook_status] ?? session.lead_webhook_status}</strong>
                {session.lead_webhook_error && <span className="block text-xs text-red-700">{session.lead_webhook_error}</span>}
              </span>
              {session.lead_webhook_status !== "skipped" && (
                <Button variant="secondary" onClick={() => void retry("lead")}>
                  Tentar de novo
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Anotação interna: <strong>{STATUS_LABEL[session.note_status] ?? session.note_status}</strong>
                {session.note_error && <span className="block text-xs text-red-700">{session.note_error}</span>}
              </span>
              {session.note_status !== "skipped" && (
                <Button variant="secondary" onClick={() => void retry("note")}>
                  Tentar de novo
                </Button>
              )}
            </div>
            {undelivered && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-amber-800">Há mensagens do visitante que ainda não chegaram ao DataCrazy.</span>
                <Button variant="secondary" onClick={() => void retry("messages")}>
                  Reenviar mensagens
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card title="Conversa">
          {data.messages.length === 0 ? (
            <p className="text-sm text-slate-500">O visitante preencheu o formulário mas não escreveu.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {data.messages.map((message) => {
                const mine = message.author === "visitor";
                return (
                  <li key={message.id} className={`flex max-w-[80%] flex-col ${mine ? "self-start" : "self-end items-end"}`}>
                    <div
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-slate-100" : "bg-slate-900 text-white"}`}
                    >
                      {message.attachment && (
                        <a href={message.attachment.url} target="_blank" rel="noopener noreferrer" className="block underline">
                          📎 {message.attachment.filename}
                        </a>
                      )}
                      {message.text !== message.attachment?.filename && message.text}
                    </div>
                    <span className="mt-0.5 text-[11px] text-slate-400">
                      {mine ? "Visitante" : "Atendente"} · {dateTime(message.createdAt)}
                      {mine && message.deliveryStatus !== "sent" && (
                        <span className="text-amber-700"> · {message.deliveryStatus === "failed" ? "não entregue" : "pendente"}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card title="Dados pessoais (LGPD)">
          <div className="flex flex-col gap-3 text-sm text-slate-600">
            <p>
              Apaga o que está guardado neste webchat: formulário, mensagens e arquivos enviados. O registro no DataCrazy precisa ser
              apagado lá, separadamente.
            </p>
            <Button variant="danger" className="w-fit" onClick={() => void remove()}>
              Apagar dados deste visitante
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
