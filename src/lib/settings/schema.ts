import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const fieldMode = z.enum(["required", "optional", "hidden"]);
const optionalUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "URL inválida" })]);

export const configSchema = z.object({
  company: z
    .object({
      name: z.string().trim().max(80).default(""),
      website: optionalUrl.default(""),
      privacyUrl: optionalUrl.default(""),
    })
    .prefault({}),
  appearance: z
    .object({
      title: z.string().trim().max(60).default("Atendimento"),
      subtitle: z.string().trim().max(80).default("Respondemos em poucos minutos"),
      avatarUrl: optionalUrl.default(""),
      primaryColor: hex.default("#2563eb"),
      textOnPrimary: hex.default("#ffffff"),
      position: z.enum(["right", "left"]).default("right"),
      launcherText: z.string().trim().max(30).default(""),
      theme: z.enum(["light", "dark", "auto"]).default("light"),
      welcomeMessage: z.string().trim().max(500).default("Olá! 👋 Como podemos ajudar?"),
      offlineMessage: z
        .string()
        .trim()
        .max(500)
        .default("Estamos fora do horário de atendimento, mas pode deixar sua mensagem que respondemos assim que possível."),
      autoOpenSeconds: z.number().int().min(0).max(600).default(0),
    })
    .prefault({}),
  form: z
    .object({
      name: fieldMode.exclude(["hidden"]).default("required"),
      email: fieldMode.default("required"),
      phone: fieldMode.default("required"),
      defaultCountry: z
        .string()
        .regex(/^\d{1,3}$/)
        .default("55"),
      consentText: z
        .string()
        .trim()
        .max(500)
        .default("Concordo com o tratamento dos meus dados para fins de atendimento, conforme a Política de Privacidade."),
      // Change it whenever the consent text or the privacy policy changes.
      consentVersion: z.string().trim().max(40).default("1"),
    })
    .prefault({}),
  hours: z
    .object({
      enabled: z.boolean().default(false),
      timezone: z.string().default("America/Sao_Paulo"),
      // Index 0 = Sunday.
      days: z
        .array(z.object({ enabled: z.boolean(), open: time, close: time }))
        .length(7)
        .default([
          { enabled: false, open: "09:00", close: "18:00" },
          ...Array.from({ length: 5 }, () => ({ enabled: true, open: "09:00", close: "18:00" })),
          { enabled: false, open: "09:00", close: "13:00" },
        ]),
    })
    .prefault({}),
  datacrazy: z
    .object({
      instanceId: z.string().default(""),
      instanceName: z.string().default(""),
      // Webhook URL of the Universal Connection (Recebimento tab).
      webhookUrl: optionalUrl.default(""),
      // Webhook of the DataCrazy automation that creates the lead when the form is submitted.
      leadWebhookUrl: optionalUrl.default(""),
      leadSource: z.string().trim().max(60).default("Webchat"),
      // One-shot internal note with the form data in the conversation (needs the API key).
      internalNote: z.boolean().default(true),
    })
    .prefault({}),
  security: z
    .object({
      allowedOrigins: z.array(z.string()).default([]),
    })
    .prefault({}),
  uploads: z
    .object({
      enabled: z.boolean().default(true),
      maxSizeMb: z.number().int().min(1).max(25).default(10),
    })
    .prefault({}),
  retention: z
    .object({
      // 0 = keep forever.
      days: z.number().int().min(0).max(3650).default(0),
    })
    .prefault({}),
  setupCompletedAt: z.string().nullable().default(null),
});

export type WebchatConfig = z.infer<typeof configSchema>;

export const secretsSchema = z.object({
  dcApiKey: z.string().default(""),
  // Bearer token DataCrazy uses to call /api/datacrazy/outbound (Envio tab, credential "token").
  outboundToken: z.string().default(""),
  // HMAC secret for X-Webchat-Signature (Recebimento tab, "Segredo de Validação").
  webhookSecret: z.string().default(""),
});

export type WebchatSecrets = z.infer<typeof secretsSchema>;

export function parseConfig(raw: unknown): WebchatConfig {
  const parsed = configSchema.safeParse(raw ?? {});
  // A config saved by an older version may not match: fall back to defaults field by field.
  return parsed.success ? parsed.data : configSchema.parse({});
}
