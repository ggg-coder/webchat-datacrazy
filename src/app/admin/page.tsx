"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, api } from "@/components/ui";
import { PageTitle } from "./admin-shell";
import { SetupStatus } from "./setup-status";
import { useSettings } from "./use-settings";

type Step = { done: boolean; optional?: boolean; title: string; description: string; href: string; action: string };

export default function AdminHome() {
  const { config, hasApiKey } = useSettings();
  const [ready, setReady] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    let active = true;
    api<{ baseUrl: string }>("/api/admin/connection").then((result) => active && result.ok && setBaseUrl(result.baseUrl));
    return () => {
      active = false;
    };
  }, []);

  const steps: Step[] = config
    ? [
        {
          done: Boolean(config.company.name),
          title: "Dados da empresa",
          description: "Nome, site e política de privacidade.",
          href: "/admin/configuracoes",
          action: "Preencher",
        },
        {
          done: hasApiKey && Boolean(config.datacrazy.instanceId),
          title: "API key e conexão do DataCrazy",
          description: "Cole a API key e escolha qual conexão é a do webchat.",
          href: "/admin/conexao",
          action: "Conectar",
        },
        {
          done: Boolean(config.datacrazy.webhookUrl),
          title: "Conexão Universal",
          description: "Preencha as abas Envio e Recebimento no DataCrazy e cole aqui a URL de Webhook.",
          href: "/admin/conexao#universal",
          action: "Configurar",
        },
        {
          done: Boolean(config.datacrazy.leadWebhookUrl),
          optional: true,
          title: "Automação de lead",
          description: "Cria o lead no DataCrazy com e-mail e telefone assim que o formulário é enviado.",
          href: "/admin/conexao#automacao",
          action: "Configurar",
        },
        {
          done: config.appearance.title !== "Atendimento" || config.appearance.primaryColor !== "#2563eb",
          optional: true,
          title: "Aparência",
          description: "Cor, nome, avatar e mensagens do chat.",
          href: "/admin/aparencia",
          action: "Personalizar",
        },
        {
          done: config.security.allowedOrigins.length > 0,
          title: "Instalar no site",
          description: "Informe os endereços do seu site e cole o código no HTML.",
          href: "/admin/instalacao",
          action: "Instalar",
        },
      ]
    : [];

  const pending = steps.filter((step) => !step.done && !step.optional).length;

  return (
    <>
      <PageTitle title="Início" description={baseUrl && `Endereço deste webchat: ${baseUrl}`} />
      <div className="flex flex-col gap-6">
        <SetupStatus onReady={() => setReady(true)} />
        {ready && config && (
          <Card title={pending ? `Primeiros passos · faltam ${pending}` : "Tudo configurado ✓"}>
            <ol className="flex flex-col divide-y divide-slate-100">
              {steps.map((step, index) => (
                <li key={step.title} className="flex items-center gap-4 py-3">
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      step.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {step.title}
                      {step.optional && <span className="font-normal text-slate-400"> · opcional</span>}
                      <span className="sr-only">{step.done ? " (concluído)" : " (pendente)"}</span>
                    </p>
                    <p className="text-xs text-slate-500">{step.description}</p>
                  </div>
                  <Link
                    href={step.href}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    {step.done ? "Editar" : step.action}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </>
  );
}
