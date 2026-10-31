import { z } from "zod";
import { isAllowedWebhookUrl } from "@/lib/datacrazy/webhook";
import { fail, ok, readJson } from "@/lib/http";
import { getSettings, saveConfig } from "@/lib/settings";
import { configSchema } from "@/lib/settings/schema";
import { requireAdmin } from "@/lib/admin-guard";

const SECTIONS = ["company", "appearance", "form", "hours", "datacrazy", "security", "uploads", "retention"] as const;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { config, secrets } = await getSettings();
  return ok({ config, hasApiKey: Boolean(secrets.dcApiKey) });
}

// Partial update: each section sent replaces that section, everything is validated together.
const putSchema = z.object(Object.fromEntries(SECTIONS.map((key) => [key, z.unknown().optional()]))).extend({
  setupCompleted: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request, putSchema);
  if ("error" in body) return fail(body.error);
  const { config } = await getSettings();

  const next: Record<string, unknown> = { ...config };
  for (const key of SECTIONS) {
    const value = body.data[key];
    if (value !== undefined) next[key] = { ...(config[key] as object), ...(value as object) };
  }
  if (body.data.setupCompleted) next.setupCompletedAt = config.setupCompletedAt ?? new Date().toISOString();

  const parsed = configSchema.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue ? `${issue.path.join(".")}: ${issue.message}` : "Configuração inválida.");
  }
  for (const url of [parsed.data.datacrazy.webhookUrl, parsed.data.datacrazy.leadWebhookUrl]) {
    if (url && !isAllowedWebhookUrl(url)) return fail("As URLs de webhook precisam ser do DataCrazy (https://….datacrazy.io).");
  }
  for (const [index, day] of parsed.data.hours.days.entries()) {
    if (day.enabled && day.open >= day.close)
      return fail(`Horário inválido em ${WEEKDAY_NAMES[index]}: o fim precisa ser depois do início.`);
  }
  return ok({ config: await saveConfig(parsed.data) });
}

const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
