import { normalizePhone } from "@/lib/phone";
import type { WebchatConfig } from "@/lib/settings/schema";
import type { startSessionSchema } from "./shared";
import type { z } from "zod";

type Input = z.infer<typeof startSessionSchema>;
export type VisitorFields = { name: string; email: string | null; phone: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Applies the panel's required/optional/hidden rules. Returns field-level errors in Portuguese.
export function validateVisitor(input: Input, form: WebchatConfig["form"]): { fields: VisitorFields } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (form.name === "required" && name.length < 2) errors.name = "Informe seu nome.";

  let email: string | null = null;
  if (form.email !== "hidden" && input.email) {
    if (EMAIL_RE.test(input.email)) email = input.email.toLowerCase();
    else errors.email = "E-mail inválido.";
  } else if (form.email === "required") errors.email = "Informe seu e-mail.";

  let phone: string | null = null;
  if (form.phone !== "hidden" && input.phone) {
    phone = normalizePhone(input.phone);
    if (!phone) errors.phone = "Telefone inválido. Confira o DDD e o número.";
  } else if (form.phone === "required") errors.phone = "Informe seu telefone.";

  if (!input.identified && !input.consent) errors.consent = "É preciso aceitar para continuar.";

  if (Object.keys(errors).length) return { errors };
  return { fields: { name: name || "Visitante", email, phone } };
}

// "Chrome · macOS" — enough for the dashboard, without storing the full fingerprint.
export function summarizeUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Outro";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Outro";
  const mobile = /Mobi|Android|iPhone/.test(ua) ? " · celular" : "";
  return `${browser} · ${os}${mobile}`;
}
