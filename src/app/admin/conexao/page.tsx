"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Card, CopyValue, Input, Select, Toggle, api } from "@/components/ui";
import { PageTitle } from "../admin-shell";
import { useSettings } from "../use-settings";

type Connection = {
  baseUrl: string;
  outboundToken: string;
  webhookSecret: string;
  webhookUrl: string;
  leadWebhookUrl: string;
  hasApiKey: boolean;
};
type Instance = { id: string; name: string; platform?: string; provider?: string; webhook?: string };
type Check = { tab: string; label: string; ok: boolean; hint?: string };
type Feedback = { tone: "success" | "error" | "info"; text: string } | null;

const TEXT_TEMPLATE = '{"type":"text","visitorId":"${contact.contactId}","text":"${message.body}","dcMessageId":"${message.id}"}';
const ATTACHMENT_TEMPLATE =
  '{"type":"attachment","visitorId":"${contact.contactId}","text":"${message.body}","dcMessageId":"${message.id}","attachment":{"url":"${attachment.url}","mimeType":"${attachment.mimeType}","filename":"${attachment.filename}"}}';

// Same order as the "Recebimento" tab in DataCrazy. Empty value = leave the field empty.
const RECEIVING_FIELDS: [string, string][] = [
  ["Caminho do ID do Contato", "contact.id"],
  ["Caminho do Corpo da Mensagem", "message.text"],
  ["Caminho do ID da Mensagem", "message.id"],
  ["Caminho do Nome do Contato", "contact.name"],
  ["Caminho do Timestamp", "message.timestamp"],
  ["Caminho do ID Externo da Mensagem", ""],
  ["Caminho da URL do Anexo", "message.attachment.url"],
  ["Caminho do Tipo do Anexo", "message.attachment.mimeType"],
  ["Caminho do From Me", "contact.isAgent"],
];

const LEAD_FIELDS = [
  "nome",
  "email",
  "telefone",
  "telefoneNumeros",
  "contactId",
  "origem",
  "paginaOrigem",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "consentimentoVersao",
];

function Section({ title }: { title: string }) {
  return <h3 className="mt-4 border-t border-slate-200 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>;
}

function Row({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-slate-100 py-2.5 sm:grid-cols-[220px_1fr] sm:gap-4">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="min-w-0">
        {children}
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
    </div>
  );
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  return feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null;
}

export default function ConnectionPage() {
  const settings = useSettings();
  const { config, hasApiKey } = settings;
  const [connection, setConnection] = useState<Connection | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keyFeedback, setKeyFeedback] = useState<Feedback>(null);
  const [webhookFeedback, setWebhookFeedback] = useState<Feedback>(null);
  const [leadFeedback, setLeadFeedback] = useState<Feedback>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [leadWebhookUrl, setLeadWebhookUrl] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<Connection>("/api/admin/connection").then((result) => active && result.ok && setConnection(result));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasApiKey) return;
    let active = true;
    api<{ instances: Instance[] }>("/api/admin/datacrazy/instances").then((result) => {
      if (!active) return;
      if (result.ok) setInstances(result.instances);
      else setKeyFeedback({ tone: "error", text: result.error ?? "Não foi possível listar as conexões." });
    });
    return () => {
      active = false;
    };
  }, [hasApiKey]);

  async function saveApiKey() {
    setBusy("key");
    setKeyFeedback(null);
    const result = await api<{ instances: Instance[] }>("/api/admin/datacrazy/api-key", {
      method: "POST",
      body: JSON.stringify({ apiKey }),
    });
    setBusy(null);
    if (!result.ok) return setKeyFeedback({ tone: "error", text: result.error ?? "Chave recusada." });
    setInstances(result.instances);
    settings.setHasApiKey(true);
    setEditingKey(false);
    setApiKey("");
    setKeyFeedback({ tone: "success", text: `Chave válida e salva. ${result.instances.length} conexão(ões) encontrada(s).` });
  }

  async function refreshInstances() {
    setBusy("instances");
    const result = await api<{ instances: Instance[] }>("/api/admin/datacrazy/instances");
    setBusy(null);
    if (!result.ok) return setKeyFeedback({ tone: "error", text: result.error ?? "Não foi possível listar as conexões." });
    setInstances(result.instances);
    setKeyFeedback({ tone: "success", text: `Lista atualizada: ${result.instances.length} conexão(ões).` });
  }

  async function chooseInstance(id: string) {
    const instance = instances?.find((item) => item.id === id);
    // DataCrazy knows the connection's webhook URL: fill it in instead of asking for it.
    const webhookUrl = instance?.webhook?.startsWith("https://") ? instance.webhook : config!.datacrazy.webhookUrl;
    if (await settings.save({ datacrazy: { ...config!.datacrazy, instanceId: id, instanceName: instance?.name ?? "", webhookUrl } })) {
      setConnection((current) => (current ? { ...current, webhookUrl } : current));
      setWebhookUrl(null);
    }
  }

  async function verify() {
    setBusy("verify");
    setVerifyError(null);
    const result = await api<{ checks: Check[]; webhookUpdated: boolean }>("/api/admin/datacrazy/verify", { method: "POST" });
    setBusy(null);
    if (!result.ok) return setVerifyError(result.error ?? "Não foi possível conferir.");
    setChecks(result.checks);
    if (result.webhookUpdated) {
      const fresh = await api<Connection>("/api/admin/connection");
      if (fresh.ok) setConnection(fresh);
      setWebhookUrl(null);
    }
  }

  async function updateConnection(patch: Partial<Pick<Connection, "webhookUrl" | "leadWebhookUrl">> & { regenerate?: string }) {
    const result = await api<Connection>("/api/admin/connection", { method: "PUT", body: JSON.stringify(patch) });
    if (result.ok) setConnection(result);
    return result;
  }

  async function saveAndTest(target: "message" | "lead") {
    const setFeedback = target === "lead" ? setLeadFeedback : setWebhookFeedback;
    const url = target === "lead" ? leadWebhookUrl : webhookUrl;
    setBusy(target);
    setFeedback(null);
    if (url !== null) {
      const saved = await updateConnection(target === "lead" ? { leadWebhookUrl: url.trim() } : { webhookUrl: url.trim() });
      if (!saved.ok) {
        setBusy(null);
        return setFeedback({ tone: "error", text: saved.error ?? "URL inválida." });
      }
    }
    const result = await api("/api/admin/datacrazy/test-webhook", { method: "POST", body: JSON.stringify({ target }) });
    setBusy(null);
    if (!result.ok) return setFeedback({ tone: "error", text: result.error ?? "Falha no teste." });
    setFeedback({
      tone: "success",
      text:
        target === "lead"
          ? "Enviado. Confira no DataCrazy se a automação rodou e criou o lead “Teste do Webchat”."
          : "Enviado. Abra o Multiatendimento do DataCrazy: deve aparecer uma conversa de “Teste do Webchat”. Se não aparecer em 1 minuto, veja os Logs da Conexão Universal (eles somem depois de 1 hora).",
    });
  }

  async function regenerate(which: "outboundToken" | "webhookSecret") {
    const label = which === "outboundToken" ? "o token de envio" : "o segredo do webhook";
    if (!window.confirm(`Gerar um novo valor para ${label}? Você vai precisar atualizar o DataCrazy em seguida.`)) return;
    await updateConnection({ regenerate: which });
  }

  if (!config || !connection) return <PageTitle title="Conexão DataCrazy" description="Carregando…" />;

  return (
    <>
      <PageTitle title="Conexão DataCrazy" description="Siga os passos na ordem. Cada valor tem um botão para copiar." />
      <div className="flex flex-col gap-6">
        <Card title="1. API key do DataCrazy">
          <div className="flex flex-col gap-3">
            {hasApiKey && !editingKey ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-emerald-700">✓ Chave salva (criptografada)</span>
                <Button variant="secondary" onClick={() => setEditingKey(true)}>
                  Trocar chave
                </Button>
              </div>
            ) : (
              <>
                <Input
                  label="API key"
                  type="password"
                  autoComplete="off"
                  placeholder="dc_..."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  hint={
                    <>
                      Gere em{" "}
                      <a className="underline" href="https://crm.datacrazy.io/config/api" target="_blank" rel="noopener noreferrer">
                        crm.datacrazy.io/config/api
                      </a>
                      . Copie a chave inteira, com o prefixo dc_.
                    </>
                  }
                />
                <Button className="w-fit" onClick={saveApiKey} disabled={busy === "key" || apiKey.trim().length < 10}>
                  {busy === "key" ? "Testando…" : "Testar e salvar"}
                </Button>
              </>
            )}
            <FeedbackLine feedback={keyFeedback} />
            {hasApiKey && instances && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="Qual conexão é a do webchat?"
                    value={config.datacrazy.instanceId}
                    onChange={(event) => void chooseInstance(event.target.value)}
                    options={[
                      { value: "", label: instances.length ? "Escolha a Conexão Universal…" : "Nenhuma conexão encontrada" },
                      ...instances.map((instance) => ({
                        value: instance.id,
                        label: `${instance.name}${instance.platform ? ` · ${instance.platform}` : ""}`,
                      })),
                    ]}
                    hint="Ainda não criou? Crie nos passos 2 e 3 e clique em Atualizar lista."
                  />
                </div>
                <Button variant="secondary" className="mb-5" onClick={() => void refreshInstances()} disabled={busy === "instances"}>
                  {busy === "instances" ? "Atualizando…" : "Atualizar lista"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card title="2. Conexão Universal · aba Envio">
          <p className="mb-2 text-sm text-slate-600">
            No DataCrazy: <strong>Configurações → Conexões → Nova Conexão → Conexão Universal</strong>. Dê um nome (ex.: “Webchat do site”).
            Os textos cinza que já aparecem nos campos são só exemplos: substitua todos pelos valores abaixo, na mesma ordem da tela.
          </p>
          <Row label="URL Base">
            <CopyValue value={connection.baseUrl} label="URL Base" />
          </Row>

          <Section title="Endpoint de Envio de Texto" />
          <Row label="Método">POST</Row>
          <Row label="Caminho">
            <CopyValue value="/api/datacrazy/outbound" label="caminho" />
          </Row>
          <Row label="Template do Body">
            <CopyValue value={TEXT_TEMPLATE} label="template de texto" />
          </Row>
          <Row label="Content-Type">application/json (já vem preenchido)</Row>
          <Row label="Timeout (ms)">30000 (deixe como está)</Row>

          <Section title="Autenticação" />
          <Row label="Tipo de Autenticação">Bearer Token</Row>
          <Row label="Chave do Bearer Token">
            <CopyValue value="token" label="chave do Bearer Token" />
          </Row>

          <Section title="Credenciais" />
          <Row label="Nome da variável">
            <CopyValue value="token" label="nome da credencial" />
          </Row>
          <Row
            label="Valor"
            note={
              <button type="button" className="underline" onClick={() => void regenerate("outboundToken")}>
                Gerar novo token
              </button>
            }
          >
            <CopyValue value={connection.outboundToken} label="valor do token" />
          </Row>

          <Section title="Headers e Parâmetros de Query" />
          <Row label="Headers">Deixe só o Content-Type: application/json que já vem</Row>
          <Row label="Parâmetros de Query">Deixe vazio</Row>

          <Section title="Mapeamento de Resposta" />
          <Row label="Caminho do ID da Mensagem">
            <CopyValue value="id" label="caminho do ID da mensagem" />
          </Row>
          <Row label="Caminho do Sucesso">
            <CopyValue value="ok" label="caminho do sucesso" />
          </Row>

          <Section title="Endpoints Adicionais" />
          <p className="py-2 text-sm text-slate-600">
            Clique em <strong>Adicionar Endpoint</strong> para as respostas com anexo (imagem, PDF, áudio):
          </p>
          <Row label="Nome do Endpoint">
            <CopyValue value="Anexos" label="nome do endpoint" />
          </Row>
          <Row label="Tipos de Anexo">Todos</Row>
          <Row label="Método">POST</Row>
          <Row label="Caminho">
            <CopyValue value="/api/datacrazy/outbound" label="caminho dos anexos" />
          </Row>
          <Row label="Template do Body">
            <CopyValue value={ATTACHMENT_TEMPLATE} label="template de anexos" />
          </Row>
          <p className="mt-3 text-xs text-slate-500">Depois clique em “Testar Conexão” no DataCrazy: ele deve responder com sucesso.</p>
        </Card>

        <Card title="3. Conexão Universal · aba Recebimento">
          <Row label="Habilitar recebimento de mensagens">Ligado</Row>

          <Section title="Mapeamento de Campos" />
          {RECEIVING_FIELDS.map(([label, value]) => (
            <Row key={label} label={label}>
              {value ? <CopyValue value={value} label={label} /> : <span className="text-sm text-slate-500">Deixe vazio</span>}
            </Row>
          ))}

          <Section title="Validação do Webhook" />
          <Row
            label="Header de Assinatura"
            note="Digite letra por letra: texto colado pode trazer caracteres invisíveis e o DataCrazy recusa a assinatura sem avisar."
          >
            <CopyValue value="X-Webchat-Signature" label="header de assinatura" />
          </Row>
          <Row label="Algoritmo">hmac-sha256</Row>
          <Row
            label="Segredo de Validação"
            note={
              <button type="button" className="underline" onClick={() => void regenerate("webhookSecret")}>
                Gerar novo segredo
              </button>
            }
          >
            <CopyValue value={connection.webhookSecret} label="segredo de validação" />
          </Row>

          <Section title="Filtros" />
          <Row label="Campo Obrigatório">
            <CopyValue value="message.id" label="campo obrigatório" />
          </Row>
          <Row label="Ignorar Mensagens Próprias">
            <CopyValue value="contact.isAgent" label="ignorar mensagens próprias" />
          </Row>
          <p className="mt-3 text-xs text-slate-500">
            Clique em <strong>Finalizar</strong> e depois use o passo 4 para conferir tudo.
          </p>
        </Card>

        <Card title="4. Conferir a configuração">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Depois de salvar a conexão no DataCrazy, confira aqui: o painel lê o que foi salvo lá e compara campo por campo (os segredos
              são comparados sem aparecer na tela). A URL de Webhook é preenchida automaticamente.
            </p>
            <Button className="w-fit" onClick={() => void verify()} disabled={busy === "verify" || !config.datacrazy.instanceId}>
              {busy === "verify" ? "Conferindo…" : "Conferir configuração"}
            </Button>
            {!config.datacrazy.instanceId && <p className="text-xs text-slate-500">Escolha a conexão no passo 1 primeiro.</p>}
            {verifyError && <Alert tone="error">{verifyError}</Alert>}
            {checks && (
              <>
                <Alert tone={checks.every((check) => check.ok) ? "success" : "warning"}>
                  {checks.every((check) => check.ok)
                    ? "Tudo certo com a Conexão Universal."
                    : `${checks.filter((check) => !check.ok).length} item(ns) para corrigir no DataCrazy. Corrija, salve lá e confira de novo.`}
                </Alert>
                <ul className="flex flex-col divide-y divide-slate-100 text-sm">
                  {checks.map((check) => (
                    <li key={`${check.tab}-${check.label}`} className="flex gap-3 py-2">
                      <span aria-hidden className={check.ok ? "text-emerald-600" : "text-red-600"}>
                        {check.ok ? "✓" : "✗"}
                      </span>
                      <span className="min-w-0">
                        <span className="text-xs text-slate-400">{check.tab} · </span>
                        {check.label}
                        <span className="sr-only">{check.ok ? " (ok)" : " (corrigir)"}</span>
                        {check.hint && <span className="block text-xs text-red-700">{check.hint}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>

        <Card title="5. URL de Webhook">
          <div id="universal" className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Cole aqui a <strong>URL do Webhook</strong> que o DataCrazy mostrou ao finalizar a conexão (ela também fica na aba
              Recebimento).
            </p>
            <Input
              label="URL de Webhook da Conexão Universal"
              placeholder="https://..."
              value={webhookUrl ?? connection.webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
            />
            <Button
              className="w-fit"
              onClick={() => void saveAndTest("message")}
              disabled={busy === "message" || !(webhookUrl ?? connection.webhookUrl)}
            >
              {busy === "message" ? "Enviando…" : "Salvar e enviar mensagem de teste"}
            </Button>
            <FeedbackLine feedback={webhookFeedback} />
          </div>
        </Card>

        <Card title="6. Automação de lead (recomendado)">
          <div id="automacao" className="flex flex-col gap-3 text-sm">
            <p className="text-slate-600">
              Quando o visitante envia o formulário, o webchat avisa o DataCrazy <strong>na hora</strong>, com nome, e-mail e telefone. Crie
              uma automação com gatilho <strong>Webhook</strong> que cria (ou atualiza) o lead com esses campos e cole a URL dela abaixo.
            </p>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Campos disponíveis no corpo do webhook:</p>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_FIELDS.map((field) => (
                  <code key={field} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    {field}
                  </code>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                O <code>contactId</code> é o mesmo ID do contato da conversa no Multiatendimento: use-o para ligar o lead à conversa. As
                mensagens do chat também levam esses dados em <code>lead.*</code>, para automações com gatilho “Mensagem Recebida”.
              </p>
            </div>
            <Input
              label="URL do webhook da automação"
              placeholder="https://..."
              value={leadWebhookUrl ?? connection.leadWebhookUrl}
              onChange={(event) => setLeadWebhookUrl(event.target.value)}
            />
            <Button
              className="w-fit"
              onClick={() => void saveAndTest("lead")}
              disabled={busy === "lead" || !(leadWebhookUrl ?? connection.leadWebhookUrl)}
            >
              {busy === "lead" ? "Enviando…" : "Salvar e enviar lead de teste"}
            </Button>
            <FeedbackLine feedback={leadFeedback} />
          </div>
        </Card>

        <Card title="7. Anotação interna">
          <div className="flex flex-col gap-3">
            <Toggle
              label="Publicar os dados do formulário como anotação interna na conversa"
              hint="Na primeira mensagem, o atendente vê nome, e-mail, telefone, página de origem e UTMs dentro da conversa. Precisa da API key."
              checked={config.datacrazy.internalNote}
              onChange={(internalNote) => void settings.save({ datacrazy: { ...config.datacrazy, internalNote } })}
            />
            {settings.message && <FeedbackLine feedback={settings.message} />}
          </div>
        </Card>
      </div>
    </>
  );
}
