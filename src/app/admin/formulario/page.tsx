"use client";

import { Card, Input, SaveBar, Select, Textarea, Toggle } from "@/components/ui";
import type { WebchatConfig } from "@/lib/settings/schema";
import { PageTitle } from "../admin-shell";
import { useSection, useSettings } from "../use-settings";

const MODES = [
  { value: "required", label: "Obrigatório" },
  { value: "optional", label: "Opcional" },
  { value: "hidden", label: "Não perguntar" },
];
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
];

type Form = WebchatConfig["form"];

export default function FormPage() {
  const settings = useSettings();
  const form = useSection(settings.config, "form");
  const hours = useSection(settings.config, "hours");

  async function save() {
    if (!form.value || !hours.value) return;
    if (await settings.save({ form: form.value, hours: hours.value })) {
      form.reset();
      hours.reset();
    }
  }

  if (!form.value || !hours.value) return <PageTitle title="Formulário e horário" description="Carregando…" />;
  const f = form.value;
  const h = hours.value;

  return (
    <>
      <PageTitle title="Formulário e horário" description="O formulário aparece antes da conversa; os dados vão para o DataCrazy." />
      <div className="flex flex-col gap-6">
        <Card title="Campos do formulário">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Nome"
              value={f.name}
              onChange={(e) => form.update({ name: e.target.value as Form["name"] })}
              options={MODES.filter((mode) => mode.value !== "hidden")}
            />
            <Select
              label="E-mail"
              value={f.email}
              onChange={(e) => form.update({ email: e.target.value as Form["email"] })}
              options={MODES}
            />
            <Select
              label="Telefone"
              value={f.phone}
              onChange={(e) => form.update({ phone: e.target.value as Form["phone"] })}
              options={MODES}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
            <Input
              label="DDI padrão"
              inputMode="numeric"
              maxLength={3}
              value={f.defaultCountry}
              onChange={(e) => form.update({ defaultCountry: e.target.value.replace(/\D/g, "") })}
              hint="55 = Brasil"
            />
          </div>
        </Card>

        <Card title="Consentimento (LGPD)">
          <div className="flex flex-col gap-4">
            <Textarea
              label="Texto da caixa de aceite"
              maxLength={500}
              value={f.consentText}
              onChange={(e) => form.update({ consentText: e.target.value })}
              hint="O link para a Política de Privacidade (Configurações) aparece logo depois. A caixa começa desmarcada."
            />
            <Input
              label="Versão do texto"
              maxLength={40}
              value={f.consentVersion}
              onChange={(e) => form.update({ consentVersion: e.target.value })}
              hint="Mude sempre que alterar o texto ou a política: cada aceite é gravado com a versão vigente."
            />
          </div>
        </Card>

        <Card title="Horário de atendimento">
          <div className="flex flex-col gap-4">
            <Toggle
              label="Usar horário de atendimento"
              hint="Fora do horário o chat continua funcionando, mas mostra a mensagem de fora do horário (Aparência)."
              checked={h.enabled}
              onChange={(enabled) => hours.update({ enabled })}
            />
            {h.enabled && (
              <>
                <Select
                  label="Fuso horário"
                  value={h.timezone}
                  onChange={(e) => hours.update({ timezone: e.target.value })}
                  options={TIMEZONES.map((zone) => ({ value: zone, label: zone.replace("America/", "").replace("_", " ") }))}
                />
                <div className="flex flex-col divide-y divide-slate-100">
                  {h.days.map((day, index) => (
                    <div key={WEEKDAYS[index]} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <label className="flex w-32 items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-slate-900"
                          checked={day.enabled}
                          onChange={(e) =>
                            hours.update({ days: h.days.map((d, i) => (i === index ? { ...d, enabled: e.target.checked } : d)) })
                          }
                        />
                        {WEEKDAYS[index]}
                      </label>
                      {day.enabled ? (
                        <>
                          <input
                            type="time"
                            aria-label={`${WEEKDAYS[index]}: abre`}
                            className="rounded-lg border border-slate-300 px-2 py-1"
                            value={day.open}
                            onChange={(e) =>
                              hours.update({ days: h.days.map((d, i) => (i === index ? { ...d, open: e.target.value } : d)) })
                            }
                          />
                          <span>às</span>
                          <input
                            type="time"
                            aria-label={`${WEEKDAYS[index]}: fecha`}
                            className="rounded-lg border border-slate-300 px-2 py-1"
                            value={day.close}
                            onChange={(e) =>
                              hours.update({ days: h.days.map((d, i) => (i === index ? { ...d, close: e.target.value } : d)) })
                            }
                          />
                        </>
                      ) : (
                        <span className="text-slate-400">Fechado</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        <SaveBar saving={settings.saving} message={settings.message} onSave={() => void save()} />
      </div>
    </>
  );
}
