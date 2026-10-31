"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, Card, api } from "@/components/ui";
import { PageTitle } from "../admin-shell";

const TestChat = dynamic(() => import("./test-chat"), { ssr: false });

type Activity = {
  environment: {
    baseUrl: string;
    reachable: boolean;
    webhookUrl: boolean;
    leadWebhookUrl: boolean;
    hasApiKey: boolean;
    internalNote: boolean;
  };
  session: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
    leadWebhook: { status: string; error: string | null };
    note: { status: string; error: string | null };
  } | null;
  messages: {
    id: string;
    author: string;
    text: string;
    createdAt: string;
    deliveryStatus: string | null;
    attempts: number;
    lastError: string | null;
    attachment: { filename: string } | null;
  }[];
  logs: { id: number; kind: string; status: string; summary: Record<string, unknown>; error: string | null; created_at: string }[];
};

type Event = { at: string; tone: "ok" | "error" | "wait" | "info"; title: string; detail?: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ICON = { ok: "✓", error: "✗", wait: "…", info: "•" };
const COLOR = { ok: "text-emerald-600", error: "text-red-600", wait: "text-amber-600", info: "text-slate-400" };

// Turns the raw records into a readable timeline.
function buildEvents(activity: Activity): Event[] {
  const { session, messages, logs, environment } = activity;
  if (!session) return [];
  const events: Event[] = [
    {
      at: session.createdAt,
      tone: "ok",
      title: `Formulário enviado por ${session.name}`,
      detail: [session.email, session.phone].filter(Boolean).join(" · "),
    },
  ];

  const lead = session.leadWebhook;
  const leadLog = logs.find((log) => log.kind === "lead_webhook");
  if (lead.status === "skipped")
    events.push({ at: session.createdAt, tone: "info", title: "Automação de lead não configurada (passo 5 da Conexão)" });
  else if (lead.status === "ok")
    events.push({ at: leadLog?.created_at ?? session.createdAt, tone: "ok", title: "Lead enviado à automação do DataCrazy" });
  else if (lead.status === "failed")
    events.push({
      at: leadLog?.created_at ?? session.createdAt,
      tone: "error",
      title: "Automação de lead recusou o envio",
      detail: lead.error ?? undefined,
    });
  else events.push({ at: session.createdAt, tone: "wait", title: "Enviando lead à automação…", detail: lead.error ?? undefined });

  for (const message of messages) {
    const label = message.text || message.attachment?.filename || "(anexo)";
    if (message.author === "agent") {
      const simulated = logs.some(
        (log) =>
          log.kind === "outbound" && log.summary.simulated && Math.abs(Date.parse(log.created_at) - Date.parse(message.createdAt)) < 5000,
      );
      events.push({
        at: message.createdAt,
        tone: "ok",
        title: simulated ? "Resposta simulada pelo painel" : "Resposta do atendente recebida do DataCrazy",
        detail: label,
      });
      continue;
    }
    events.push({ at: message.createdAt, tone: "info", title: "Visitante escreveu", detail: label });
    if (message.deliveryStatus === "sent") {
      events.push({
        at: message.createdAt,
        tone: "ok",
        title: "Mensagem entregue ao DataCrazy",
        detail: "Confira no Multiatendimento: o DataCrazy aceita tudo e só lá dá para ver se processou.",
      });
    } else if (message.deliveryStatus === "failed") {
      events.push({ at: message.createdAt, tone: "error", title: "Entrega ao DataCrazy falhou", detail: message.lastError ?? undefined });
    } else {
      events.push({
        at: message.createdAt,
        tone: "wait",
        title: message.attempts ? `Entrega pendente (${message.attempts} tentativa(s)); vai tentar de novo` : "Enviando ao DataCrazy…",
        detail: message.lastError ?? undefined,
      });
    }
  }

  if (messages.some((message) => message.author === "visitor")) {
    const note = session.note;
    if (!environment.internalNote || !environment.hasApiKey) {
      // Not configured: nothing to show.
    } else if (note.status === "ok")
      events.push({
        at: logs.find((l) => l.kind === "internal_note")?.created_at ?? session.createdAt,
        tone: "ok",
        title: "Anotação interna publicada na conversa",
      });
    else if (note.status === "failed")
      events.push({ at: session.createdAt, tone: "error", title: "Anotação interna falhou", detail: note.error ?? undefined });
    else if (note.status === "pending")
      events.push({
        at: session.createdAt,
        tone: "wait",
        title: "Procurando a conversa no DataCrazy para a anotação interna…",
        detail: note.error ?? undefined,
      });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export default function TestPage() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [reply, setReply] = useState("");
  const [testToken, setTestToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ token: string }>("/api/admin/test/token").then((result) => active && result.ok && setTestToken(result.token));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      api<Activity>("/api/admin/test/activity").then((result) => {
        if (active && result.ok) setActivity(result);
      });
    void load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function simulateReply() {
    if (!activity?.session || !reply.trim()) return;
    setSending(true);
    setError(null);
    const result = await api("/api/admin/test/reply", {
      method: "POST",
      body: JSON.stringify({ sessionId: activity.session.id, text: reply }),
    });
    setSending(false);
    if (!result.ok) return setError(result.error ?? "Não foi possível simular.");
    setReply("");
  }

  const env = activity?.environment;
  const events = activity ? buildEvents(activity) : [];

  return (
    <>
      <PageTitle
        title="Testar"
        description="Faça de conta que é um visitante: preencha o formulário e converse. Ao lado aparece cada passo da integração."
      />
      {env && (
        <div className="mb-6 flex flex-col gap-2">
          {!env.reachable && (
            <Alert tone="warning">
              Este app está em <strong>{env.baseUrl}</strong>, que o DataCrazy não alcança: as respostas do atendente feitas no DataCrazy
              não vão chegar aqui. Use “Simular resposta do atendente” ou publique o app (Vercel) / use um túnel.
            </Alert>
          )}
          {!env.webhookUrl && (
            <Alert tone="warning">
              A URL de Webhook da Conexão Universal não está configurada: as mensagens ficam pendentes.{" "}
              <Link href="/admin/conexao#universal" className="underline">
                Configurar
              </Link>
            </Alert>
          )}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="h-[620px] overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
          {testToken && <TestChat token={testToken} />}
        </div>
        <div className="flex flex-col gap-6">
          <Card title="O que aconteceu">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">
                Preencha o formulário do chat ao lado para começar. Para recomeçar, use ⋯ → “Iniciar nova conversa”.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {events.map((event, index) => (
                  <li key={index} className="flex gap-3 text-sm">
                    <span aria-hidden className={`w-4 shrink-0 font-semibold ${COLOR[event.tone]}`}>
                      {ICON[event.tone]}
                    </span>
                    <span className="w-16 shrink-0 tabular-nums text-xs leading-5 text-slate-400">{time(event.at)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{event.title}</span>
                      {event.detail && <span className="block break-words text-xs text-slate-500">{event.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Simular resposta do atendente">
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500">
                Entrega uma resposta no chat de teste pelo mesmo caminho que o DataCrazy usa, sem passar por ele. Só funciona nesta aba.
              </p>
              <div className="flex gap-2">
                <input
                  aria-label="Resposta simulada"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder={activity?.session ? "Olá! Como posso ajudar?" : "Inicie uma conversa no chat primeiro"}
                  value={reply}
                  disabled={!activity?.session}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void simulateReply()}
                />
                <Button onClick={() => void simulateReply()} disabled={!activity?.session || !reply.trim() || sending}>
                  {sending ? "Enviando…" : "Responder"}
                </Button>
              </div>
              {error && <Alert tone="error">{error}</Alert>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
