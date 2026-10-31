import "server-only";
import { buildLeadPayload, buildMessagePayload, nextAttemptAt, postSigned } from "@/lib/datacrazy/webhook";
import { fileUrl } from "@/lib/files";
import { logIntegration } from "@/lib/logs";
import { broadcast } from "@/lib/realtime";
import { getMessage, getSession, toSessionData, updateMessage, updateSession } from "@/lib/repo";
import { getSettings } from "@/lib/settings";

// Sends one visitor message to the Universal Connection webhook. Called right after the message is saved
// (inside after()) and again by the cron for anything still pending. The message is never lost: until it
// is accepted it stays "pending" with a next_attempt_at.
export async function deliverVisitorMessage(messageId: string): Promise<void> {
  const message = await getMessage(messageId);
  if (!message || message.author !== "visitor" || message.delivery_status === "sent") return;
  const session = await getSession(message.session_id);
  if (!session) return;

  const { config, secrets } = await getSettings();
  const attempts = message.attempts + 1;

  if (!config.datacrazy.webhookUrl) {
    await updateMessage(message.id, {
      attempts,
      last_error: "URL de webhook do DataCrazy não configurada no painel.",
      next_attempt_at: nextAttemptAt(attempts)?.toISOString() ?? null,
    });
    return;
  }

  const attachment = message.attachment?.attachmentId
    ? { url: fileUrl(message.attachment.attachmentId), mimeType: message.attachment.mimeType, filename: message.attachment.filename }
    : null;
  const payload = buildMessagePayload(
    toSessionData(session),
    { id: message.id, text: message.text, createdAt: message.created_at, attachment },
    config.datacrazy.leadSource,
  );
  const result = await postSigned(config.datacrazy.webhookUrl, secrets.webhookSecret, payload);

  if (result.ok) {
    await updateMessage(message.id, { delivery_status: "sent", attempts, last_error: null, next_attempt_at: null });
    await broadcast(session.id, "status", { id: message.id, status: "sent" });
    await logIntegration("webhook", "ok", { messageId: payload.message.id, attempts }, undefined, session.id);
    return;
  }

  const retryAt = result.retryable ? nextAttemptAt(attempts) : null;
  await updateMessage(message.id, {
    delivery_status: retryAt ? "pending" : "failed",
    attempts,
    last_error: result.error,
    next_attempt_at: retryAt?.toISOString() ?? null,
  });
  if (!retryAt) await broadcast(session.id, "status", { id: message.id, status: "failed" });
  await logIntegration("webhook", "error", { messageId: payload.message.id, attempts, status: result.status }, result.error, session.id);
}

// Fires the DataCrazy automation webhook as soon as the form is submitted, so the lead exists
// even if the visitor never writes. Skipped when no URL is configured.
export async function deliverLeadWebhook(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.lead_webhook_status === "ok") return;
  const { config, secrets } = await getSettings();

  if (!config.datacrazy.leadWebhookUrl) {
    await updateSession(sessionId, { lead_webhook_status: "skipped", lead_webhook_next_at: null });
    return;
  }

  const attempts = session.lead_webhook_attempts + 1;
  const result = await postSigned(
    config.datacrazy.leadWebhookUrl,
    secrets.webhookSecret,
    buildLeadPayload(toSessionData(session), config.datacrazy.leadSource),
  );

  if (result.ok) {
    await updateSession(sessionId, {
      lead_webhook_status: "ok",
      lead_webhook_attempts: attempts,
      lead_webhook_error: null,
      lead_webhook_next_at: null,
    });
    await logIntegration("lead_webhook", "ok", { attempts }, undefined, sessionId);
    return;
  }
  const retryAt = result.retryable ? nextAttemptAt(attempts) : null;
  await updateSession(sessionId, {
    lead_webhook_status: retryAt ? "pending" : "failed",
    lead_webhook_attempts: attempts,
    lead_webhook_error: result.error,
    lead_webhook_next_at: retryAt?.toISOString() ?? null,
  });
  await logIntegration("lead_webhook", "error", { attempts, status: result.status }, result.error, sessionId);
}
