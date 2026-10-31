import { fail, ok } from "@/lib/http";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

const PUBLIC_BUCKET = "webchat-public";
const MAX_BYTES = 1024 * 1024;

// The panel crops and resizes in the browser (square WebP/PNG); this only stores the result publicly.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!["image/webp", "image/png", "image/jpeg"].includes(type)) return fail("Envie uma imagem PNG, JPG ou WebP.", 415);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return fail("Imagem muito grande (máximo 1 MB depois de recortada).", 413);

  const path = `avatar-${Date.now()}.${type.split("/")[1]}`;
  const { error } = await db()
    .storage.from(PUBLIC_BUCKET)
    .upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  if (error) return fail(`Não foi possível salvar a imagem: ${error.message}`, 500);
  return ok({ url: db().storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl });
}
