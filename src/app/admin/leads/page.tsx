"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Select, api } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { PageTitle } from "../admin-shell";

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  page_url: string | null;
  utm: Record<string, string>;
  created_at: string;
  first_message_at: string | null;
  last_message_at: string | null;
  lead_webhook_status: string;
  note_status: string;
};
type Overview = {
  stats: {
    conversations: number;
    leads: number;
    conversion: number;
    received: number;
    sent: number;
    avgFirstResponseMs: number | null;
    leadWebhookFailed: number;
    truncated: boolean;
  };
  byDay: { day: string; count: number }[];
  byHour: number[];
  topPages: { label: string; count: number }[];
  topSources: { label: string; count: number }[];
  sessions: Lead[];
  total: number;
  pageSize: number;
};

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "custom", label: "Personalizado" },
];

const STATUS: Record<string, { label: string; tone: string }> = {
  ok: { label: "enviado", tone: "bg-emerald-50 text-emerald-700" },
  pending: { label: "pendente", tone: "bg-amber-50 text-amber-800" },
  failed: { label: "falhou", tone: "bg-red-50 text-red-700" },
  skipped: { label: "—", tone: "text-slate-400" },
};

function duration(ms: number | null) {
  if (ms === null) return "—";
  const minutes = ms / 60_000;
  if (minutes < 1) return `${Math.round(ms / 1000)} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1).replace(".", ",")} h`;
}

const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// Single-series bar chart: one neutral color, no legend (the title names it), hover tooltip per bar,
// and an equivalent table for screen readers.
function Bars({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>
      <div className="flex h-32 items-end gap-[2px] border-b border-slate-200" aria-hidden>
        {data.map((item) => (
          <div key={item.label} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-slate-700 transition-opacity group-hover:opacity-80"
              style={{ height: `${(item.value / max) * 100}%`, minHeight: item.value ? 2 : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              {item.label}: {item.value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400" aria-hidden>
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((item) => (
            <tr key={item.label}>
              <th scope="row">{item.label}</th>
              <td>{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function TopList({ title, items, empty }: { title: string; items: { label: string; count: number }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm">
          {items.map((item) => (
            <li key={item.label} className="flex justify-between gap-3">
              <span className="truncate text-slate-700" title={item.label}>
                {item.label}
              </span>
              <span className="tabular-nums text-slate-500">{item.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function LeadsPage() {
  const [period, setPeriod] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [includeTests, setIncludeTests] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams({ period, page: String(page) });
    if (period === "custom" && from) p.set("from", from);
    if (period === "custom" && to) p.set("to", to);
    if (query) p.set("q", query);
    if (includeTests) p.set("tests", "1");
    return p.toString();
  }, [period, from, to, query, includeTests, page]);

  useEffect(() => {
    let active = true;
    api<Overview>(`/api/admin/leads?${params}`).then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result);
        setError(null);
      } else setError(result.error ?? "Não foi possível carregar.");
    });
    return () => {
      active = false;
    };
  }, [params]);

  async function reprocess() {
    setReprocessing("Reprocessando…");
    const result = await api<{ report: { messages: number; leads: number; notes: number } }>("/api/admin/reprocess", { method: "POST" });
    setReprocessing(
      result.ok
        ? `Reprocessado: ${result.report.messages} mensagem(ns), ${result.report.leads} lead(s), ${result.report.notes} anotação(ões).`
        : (result.error ?? "Falhou."),
    );
  }

  const stats = data?.stats;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageTitle
        title="Leads"
        description="Quem preencheu o formulário do chat. A conversa em si acontece no DataCrazy; aqui é só leitura."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select
            label="Período"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
            options={PERIODS}
          />
        </div>
        {period === "custom" && (
          <>
            <Input label="De" type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
            <Input label="Até" type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
          </>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <Input label="Buscar" placeholder="Nome, e-mail ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-900"
            checked={includeTests}
            onChange={(e) => (setIncludeTests(e.target.checked), setPage(1))}
          />
          Incluir conversas da aba Testar
        </label>
        <div className="ml-auto flex gap-2">
          <a
            href={`/api/admin/leads/export?${params}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Exportar CSV
          </a>
          <Button variant="secondary" onClick={() => void reprocess()}>
            Reprocessar pendentes
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {reprocessing && (
        <div className="mb-4">
          <Alert tone="info">{reprocessing}</Alert>
        </div>
      )}

      {stats && data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Leads (formulários)" value={String(stats.leads)} />
            <Stat label="Conversas iniciadas" value={String(stats.conversations)} />
            <Stat label="Formulário → 1ª mensagem" value={`${Math.round(stats.conversion * 100)}%`} />
            <Stat label="Mensagens recebidas" value={String(stats.received)} />
            <Stat label="Respostas enviadas" value={String(stats.sent)} />
            <Stat label="1ª resposta (média)" value={duration(stats.avgFirstResponseMs)} />
          </div>
          {stats.leadWebhookFailed > 0 && (
            <Alert tone="warning">
              {stats.leadWebhookFailed} lead(s) não chegaram à automação do DataCrazy. Abra o lead e use “Tentar de novo”, ou confira a URL
              da automação em Conexão DataCrazy.
            </Alert>
          )}

          <Card>
            <div className="grid gap-8 lg:grid-cols-2">
              <Bars
                title="Leads por dia"
                data={data.byDay.map((item) => ({ label: item.day.split("-").reverse().slice(0, 2).join("/"), value: item.count }))}
              />
              <Bars
                title="Leads por hora do dia"
                data={data.byHour.map((value, hour) => ({ label: `${String(hour).padStart(2, "0")}h`, value }))}
              />
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <TopList title="Páginas de origem" items={data.topPages} empty="Sem dados no período." />
              <TopList title="Campanhas (UTM source / medium / campaign)" items={data.topSources} empty="Nenhum lead com UTM no período." />
            </div>
          </Card>

          <Card title={`${data.total} lead(s)`}>
            {data.sessions.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum lead no período.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-5 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium">Contato</th>
                      <th className="px-3 py-2 font-medium">Origem</th>
                      <th className="px-3 py-2 font-medium">Automação</th>
                      <th className="px-3 py-2 font-medium">Última mensagem</th>
                      <th className="px-5 py-2 font-medium">
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((lead) => {
                      const status = STATUS[lead.lead_webhook_status] ?? STATUS.skipped!;
                      let origin = lead.utm?.source ?? "";
                      if (!origin && lead.page_url) {
                        try {
                          origin = new URL(lead.page_url).pathname;
                        } catch {}
                      }
                      return (
                        <tr key={lead.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-2.5">
                            <p className="font-medium">{lead.name}</p>
                            <p className="text-xs text-slate-400">{dateTime(lead.created_at)}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <p>{lead.email ?? "—"}</p>
                            <p className="text-xs text-slate-500">{lead.phone ? formatPhone(lead.phone) : "—"}</p>
                          </td>
                          <td className="max-w-40 truncate px-3 py-2.5 text-slate-600" title={lead.page_url ?? ""}>
                            {origin || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${status.tone}`}>{status.label}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {lead.last_message_at ? dateTime(lead.last_message_at) : "não escreveu"}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <Link href={`/admin/leads/${lead.id}`} className="text-sm font-medium underline">
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <span className="text-slate-500">
                  Página {page} de {pages}
                </span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
