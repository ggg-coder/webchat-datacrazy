import { createHash } from "node:crypto";
import { after } from "next/server";
import { deliverVisitorMessage } from "@/lib/delivery";
import { scheduleInternalNote } from "@/lib/enrichment";
import { fail, readJson } from "@/lib/http";
import { toPublicMessage } from "@/lib/messages";
import { rateLimit } from "@/lib/rate-limit";
import { broadcast } from "@/lib/realtime";
import { getSession, type MessageRow, type StoredAttachment } from "@/lib/repo";
import { getSettings } from "@/lib/settings";
import { STORAGE_BUCKET, db } from "@/lib/supabase";
import { isSameOrigin, sessionIdFromRequest } from "@/lib/widget/server";
import { sendMessageSchema } from "@/lib/widget/shared";

const HISTORY_LIMIT = 200;

async function verifyUploadedFile(path: string, declaredType: string): Promise<string | null> {
  const info = await db().storage.from(STORAGE_BUCKET).info(path);
  if (info.error || !info.data) return "O envio do arquivo não terminou. Tente de novo.";
  const { config } = await getSettings();
  const size = info.data.size ?? 0;
  const storedType = (info.data.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (size <= 0 || size > config.uploads.maxSizeMb * 1024 * 1024) return `Arquivo maior que ${config.uploads.maxSizeMb} MB.`;
  if (storedType !== declaredType) return "Tipo de arquivo não permitido.";
  return null;
}

// History of the session. Also the polling fallback when Realtime is unavailable, hence the ETag.
export async function GET(request: Request) {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return fail("Sessão inválida.", 401);

  const { data, error } = await db()
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) return fail("Não foi possível carregar as mensagens.", 500);

  const messages = (data as MessageRow[]).reverse().map(toPublicMessage);
  const etag = `"${createHash("sha1")
    .update(messages.map((m) => `${m.id}:${m.status}`).join("|"))
    .digest("base64url")}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return Response.json({ ok: true, messages }, { headers: { etag, "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Origem não permitida.", 403);
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return fail("Sessão inválida.", 401);
  if (!(await rateLimit(`messages:${sessionId}`, 60, 20)))
    return fail("Você está enviando mensagens rápido demais. Aguarde um pouco.", 429);

  const body = await readJson(request, sendMessageSchema);
  if ("error" in body) return fail("Mensagem inválida.");
  const { id, text, attachmentId } = body.data;
  if (!text && !attachmentId) return fail("Mensagem vazia.");

  const session = await getSession(sessionId);
  if (!session) return fail("Sessão não encontrada.", 401);

  // Resent after a network failure: return what is stored instead of duplicating.
  const existing = await db().from("messages").select("*").eq("id", id).maybeSingle();
  if (existing.data) {
    const row = existing.data as MessageRow;
    if (row.session_id !== sessionId) return fail("Mensagem inválida.", 409);
    return Response.json({ ok: true, message: toPublicMessage(row) });
  }

  let attachment: StoredAttachment | null = null;
  if (attachmentId) {
    const { data } = await db().from("attachments").select("*").eq("id", attachmentId).eq("session_id", sessionId).maybeSingle();
    if (!data) return fail("Anexo não encontrado. Envie o arquivo de novo.", 400);
    // The browser uploads straight to Storage with a signed URL, which doesn't enforce the size or type
    // it declared. Check the stored object itself before it can reach DataCrazy.
    const problem = await verifyUploadedFile(data.path, data.mime_type);
    if (problem) {
      await db().storage.from(STORAGE_BUCKET).remove([data.path]);
      await db().from("attachments").delete().eq("id", attachmentId);
      return fail(problem, 400);
    }
    attachment = { attachmentId, mimeType: data.mime_type, filename: data.filename, size: data.size };
  }

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("messages")
    .insert({ id, session_id: sessionId, author: "visitor", text, attachment, delivery_status: "pending", created_at: now })
    .select("*")
    .single();
  if (error) return fail("Não foi possível salvar a mensagem. Tente de novo.", 500);

  const isFirst = !session.first_message_at;
  await db()
    .from("sessions")
    .update({ last_message_at: now, ...(isFirst ? { first_message_at: now } : {}) })
    .eq("id", sessionId);

  const message = toPublicMessage(data as MessageRow);
  after(async () => {
    await broadcast(sessionId, "message", message);
    await deliverVisitorMessage(id);
    if (isFirst) await scheduleInternalNote(sessionId);
  });
  return Response.json({ ok: true, message });
}
