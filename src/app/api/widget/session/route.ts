import { after } from "next/server";
import { deliverLeadWebhook } from "@/lib/delivery";
import { fail, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { channelFor } from "@/lib/realtime";
import { getSession } from "@/lib/repo";
import { getSettings } from "@/lib/settings";
import { isValidTestToken } from "@/lib/test-session";
import { db } from "@/lib/supabase";
import { createSessionToken, isSameOrigin, sessionIdFromRequest } from "@/lib/widget/server";
import { startSessionSchema, type StartSessionResponse } from "@/lib/widget/shared";
import { summarizeUserAgent, validateVisitor } from "@/lib/widget/visitor";

// Keeps origin + path only (old widget.js versions sent the full URL).
function stripQuery(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin + parsed.pathname : null;
  } catch {
    return null;
  }
}

// The referrer is another site's URL: its path and query may carry search terms, e-mails or tokens.
// The origin is enough to know where the lead came from.
function originOnly(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

// Pre-chat form submitted: creates the session and fires the lead automation webhook right away.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Origem não permitida.", 403);
  if (!(await rateLimit(`session:${clientIp(request)}`, 10 * 60, 10))) {
    return fail("Muitas tentativas. Aguarde alguns minutos e tente de novo.", 429);
  }

  const body = await readJson(request, startSessionSchema);
  if ("error" in body) return fail("Dados inválidos.");
  const input = body.data;
  if (input.website) return fail("Não foi possível iniciar a conversa.", 400);

  const { config } = await getSettings();
  const validation = validateVisitor(input, config.form);
  if ("errors" in validation) return fail("Confira os campos destacados.", 400, { fields: validation.errors });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await db()
    .from("sessions")
    .insert({
      id,
      ...validation.fields,
      // The consent record: server time, the exact text shown and its version.
      consent_at: now,
      consent_version: input.identified ? "identify" : config.form.consentVersion,
      consent_text: input.identified ? "Dados informados pelo site via DCWebchat.identify()" : config.form.consentText,
      page_url: stripQuery(input.pageUrl),
      referrer: originOnly(input.referrer),
      utm: Object.fromEntries(Object.entries(input.utm).filter(([, value]) => value)),
      user_agent: summarizeUserAgent(request.headers.get("user-agent")),
      is_test: isValidTestToken(input.testToken),
      lead_webhook_status: config.datacrazy.leadWebhookUrl ? "pending" : "skipped",
      created_at: now,
    });
  if (error) {
    console.error("session_insert_failed", { error: error.message });
    return fail("Não foi possível iniciar a conversa. Tente de novo.", 500);
  }

  if (config.datacrazy.leadWebhookUrl) after(() => deliverLeadWebhook(id));

  return Response.json({
    ok: true,
    token: createSessionToken(id),
    sessionId: id,
    channel: channelFor(id),
    name: validation.fields.name,
  } satisfies StartSessionResponse);
}

// Lets the widget check whether a stored token still points to an existing session (it may have been
// deleted by retention or on request), and recover the Realtime channel name.
export async function GET(request: Request) {
  const sessionId = sessionIdFromRequest(request);
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) return fail("Sessão não encontrada.", 401);
  return Response.json({ ok: true, sessionId: session.id, channel: channelFor(session.id), name: session.name });
}
