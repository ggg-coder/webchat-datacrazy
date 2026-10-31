"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { normalizePhone, onlyDigits } from "@/lib/phone";
import type { FieldMode, PublicWidgetConfig } from "@/lib/widget/shared";

export type FormValues = { name: string; email: string; phone: string; consent: boolean; website: string };

// "(11) 91234-5678" while typing a Brazilian number.
function maskBr(digits: string) {
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Field({ label, mode, error, children, id }: { label: string; mode: FieldMode; error?: string; children: ReactNode; id: string }) {
  if (mode === "hidden") return null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-[var(--muted)]">
        {label}
        {mode === "optional" && <span className="font-normal"> (opcional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 aria-[invalid=true]:border-red-500";

export function PreChatForm({
  config,
  submitting,
  serverError,
  serverFields,
  onSubmit,
}: {
  config: PublicWidgetConfig;
  submitting: boolean;
  serverError: string | null;
  serverFields: Record<string, string>;
  onSubmit: (values: FormValues) => void;
}) {
  const ids = { name: useId(), email: useId(), phone: useId(), consent: useId() };
  const { form } = config;
  const [values, setValues] = useState<FormValues>({ name: "", email: "", phone: "", consent: false, website: "" });
  const [country, setCountry] = useState(form.defaultCountry);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const allErrors = { ...serverFields, ...errors };

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (form.name === "required" && values.name.trim().length < 2) next.name = "Informe seu nome.";
    if (form.email !== "hidden") {
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) next.email = "E-mail inválido.";
      else if (!values.email && form.email === "required") next.email = "Informe seu e-mail.";
    }
    if (form.phone !== "hidden") {
      if (values.phone && !normalizePhone(`${country}${values.phone}`)) next.phone = "Telefone inválido. Confira o DDD e o número.";
      else if (!values.phone && form.phone === "required") next.phone = "Informe seu telefone.";
    }
    if (!values.consent) next.consent = "É preciso aceitar para continuar.";
    return next;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ ...values, phone: values.phone ? `${country}${onlyDigits(values.phone)}` : "" });
  }

  const set = (key: keyof FormValues) => (value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-4">
      <p className="text-sm text-[var(--text)]">Para começar, conte um pouco sobre você:</p>

      <Field label="Nome" mode={form.name} error={allErrors.name} id={ids.name}>
        <input
          id={ids.name}
          className={inputClass}
          autoComplete="name"
          value={values.name}
          maxLength={80}
          aria-invalid={Boolean(allErrors.name)}
          aria-describedby={allErrors.name ? `${ids.name}-error` : undefined}
          onChange={(e) => set("name")(e.target.value)}
        />
      </Field>

      <Field label="E-mail" mode={form.email} error={allErrors.email} id={ids.email}>
        <input
          id={ids.email}
          type="email"
          inputMode="email"
          className={inputClass}
          autoComplete="email"
          value={values.email}
          maxLength={200}
          aria-invalid={Boolean(allErrors.email)}
          aria-describedby={allErrors.email ? `${ids.email}-error` : undefined}
          onChange={(e) => set("email")(e.target.value.trim())}
        />
      </Field>

      <Field label="Telefone (WhatsApp)" mode={form.phone} error={allErrors.phone} id={ids.phone}>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`${ids.phone}-ddi`}>
            Código do país
          </label>
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-2 text-sm text-[var(--muted)]">
            +
            <input
              id={`${ids.phone}-ddi`}
              className="w-10 bg-transparent px-1 py-2 text-[var(--text)] outline-none"
              inputMode="numeric"
              value={country}
              maxLength={3}
              onChange={(e) => setCountry(onlyDigits(e.target.value) || "")}
            />
          </div>
          <input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            className={inputClass}
            autoComplete="tel-national"
            placeholder={country === "55" ? "(11) 91234-5678" : ""}
            value={country === "55" ? maskBr(onlyDigits(values.phone)) : values.phone}
            aria-invalid={Boolean(allErrors.phone)}
            aria-describedby={allErrors.phone ? `${ids.phone}-error` : undefined}
            onChange={(e) =>
              set("phone")(country === "55" ? onlyDigits(e.target.value).slice(0, 11) : e.target.value.replace(/[^\d\s-]/g, ""))
            }
          />
        </div>
      </Field>

      {/* Honeypot: hidden from people and screen readers, filled in by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website")(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.consent} className="flex items-start gap-2 text-xs text-[var(--muted)]">
          <input
            id={ids.consent}
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
            checked={values.consent}
            aria-invalid={Boolean(allErrors.consent)}
            onChange={(e) => set("consent")(e.target.checked)}
          />
          <span>
            {form.consentText}{" "}
            {config.privacyUrl && (
              <a href={config.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Ler a Política de Privacidade
              </a>
            )}
          </span>
        </label>
        {allErrors.consent && <p className="text-xs text-red-600">{allErrors.consent}</p>}
      </div>

      {serverError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{ background: "var(--brand)", color: "var(--on-brand)" }}
      >
        {submitting ? "Iniciando…" : "Iniciar conversa"}
      </button>
    </form>
  );
}
