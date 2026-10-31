"use client";

import { Card, Input, SaveBar, Toggle } from "@/components/ui";
import { PageTitle } from "../admin-shell";
import { useSection, useSettings } from "../use-settings";

export default function SettingsPage() {
  const settings = useSettings();
  const company = useSection(settings.config, "company");
  const uploads = useSection(settings.config, "uploads");
  const retention = useSection(settings.config, "retention");
  const datacrazy = useSection(settings.config, "datacrazy");

  async function save() {
    if (!company.value || !uploads.value || !retention.value || !datacrazy.value) return;
    const saved = await settings.save({
      company: company.value,
      uploads: uploads.value,
      retention: retention.value,
      datacrazy: datacrazy.value,
    });
    if (saved) [company, uploads, retention, datacrazy].forEach((section) => section.reset());
  }

  if (!company.value || !uploads.value || !retention.value || !datacrazy.value) {
    return <PageTitle title="Configurações" description="Carregando…" />;
  }

  return (
    <>
      <PageTitle title="Configurações" />
      <div className="flex flex-col gap-6">
        <Card title="Empresa">
          <div className="flex flex-col gap-4">
            <Input
              label="Nome da empresa"
              maxLength={80}
              value={company.value.name}
              onChange={(e) => company.update({ name: e.target.value })}
            />
            <Input
              label="Site"
              type="url"
              placeholder="https://www.seusite.com.br"
              value={company.value.website}
              onChange={(e) => company.update({ website: e.target.value.trim() })}
            />
            <Input
              label="Política de Privacidade"
              type="url"
              placeholder="https://www.seusite.com.br/privacidade"
              value={company.value.privacyUrl}
              onChange={(e) => company.update({ privacyUrl: e.target.value.trim() })}
              hint="Link exibido junto da caixa de consentimento do formulário."
            />
          </div>
        </Card>

        <Card title="Lead no DataCrazy">
          <Input
            label="Origem do lead"
            maxLength={60}
            value={datacrazy.value.leadSource}
            onChange={(e) => datacrazy.update({ leadSource: e.target.value })}
            hint="Vai no campo “origem” dos webhooks, para a automação preencher a origem do lead."
          />
        </Card>

        <Card title="Anexos">
          <div className="flex flex-col gap-4">
            <Toggle
              label="Permitir que o visitante envie arquivos"
              hint="Imagens, PDF, documentos do Office, áudio e vídeo MP4. Nada executável."
              checked={uploads.value.enabled}
              onChange={(enabled) => uploads.update({ enabled })}
            />
            {uploads.value.enabled && (
              <Input
                label="Tamanho máximo (MB)"
                type="number"
                min={1}
                max={25}
                value={uploads.value.maxSizeMb}
                onChange={(e) => uploads.update({ maxSizeMb: Math.min(25, Math.max(1, Number(e.target.value) || 1)) })}
              />
            )}
          </div>
        </Card>

        <Card title="Retenção de dados (LGPD)">
          <Input
            label="Apagar conversas guardadas aqui depois de (dias)"
            type="number"
            min={0}
            max={3650}
            value={retention.value.days}
            onChange={(e) => retention.update({ days: Math.max(0, Number(e.target.value) || 0) })}
            hint="0 = não apagar. A cópia local serve só para o histórico do widget e para o painel; o registro oficial das conversas fica no DataCrazy."
          />
        </Card>

        <SaveBar saving={settings.saving} message={settings.message} onSave={() => void save()} />
      </div>
    </>
  );
}
