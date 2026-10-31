import { sanitizeFilename } from "@/lib/files";
import { fail, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { STORAGE_BUCKET, db } from "@/lib/supabase";
import { isSameOrigin, sessionIdFromRequest } from "@/lib/widget/server";
import { isAllowedUploadType, uploadRequestSchema } from "@/lib/widget/shared";

// Every allowed type maps to a fixed extension: the visitor's file name never decides how it is stored.
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
};

// Returns a one-time signed upload URL so the browser sends the file straight to Supabase Storage
// (Vercel functions cap request bodies at 4.5 MB). The attachment row is what /files serves later.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Origem não permitida.", 403);
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return fail("Sessão inválida.", 401);
  // Per session and per IP: new sessions are cheap, so the session limit alone doesn't cap storage use.
  const allowed = (await rateLimit(`upload:${sessionId}`, 10 * 60, 20)) && (await rateLimit(`upload-ip:${clientIp(request)}`, 60 * 60, 40));
  if (!allowed) return fail("Muitos arquivos em pouco tempo. Aguarde um pouco.", 429);

  const body = await readJson(request, uploadRequestSchema);
  if ("error" in body) return fail("Arquivo inválido.");
  const { config } = await getSettings();
  if (!config.uploads.enabled) return fail("O envio de arquivos está desativado.", 403);

  const mimeType = body.data.mimeType.split(";")[0]!.trim().toLowerCase();
  if (!isAllowedUploadType(mimeType)) return fail("Tipo de arquivo não permitido. Envie imagem, PDF, documento ou áudio.", 415);
  if (body.data.size > config.uploads.maxSizeMb * 1024 * 1024) return fail(`Arquivo maior que ${config.uploads.maxSizeMb} MB.`, 413);

  const id = crypto.randomUUID();
  const filename = sanitizeFilename(body.data.filename);
  const extension = EXTENSION_BY_TYPE[mimeType];
  if (!extension) return fail("Tipo de arquivo não permitido.", 415);
  const path = `${sessionId}/${id}.${extension}`;

  const signed = await db().storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (signed.error) return fail("Não foi possível preparar o envio do arquivo.", 500);

  const { error } = await db()
    .from("attachments")
    .insert({ id, session_id: sessionId, path, mime_type: mimeType, filename, size: body.data.size });
  if (error) return fail("Não foi possível preparar o envio do arquivo.", 500);

  return Response.json({ ok: true, attachmentId: id, uploadUrl: signed.data.signedUrl, path, mimeType, filename });
}
