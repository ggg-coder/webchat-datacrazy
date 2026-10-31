import { isValidFileSignature } from "@/lib/files";
import { STORAGE_BUCKET, db } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Permanent, signed link to a visitor attachment (the one DataCrazy keeps). Redirects to a short-lived
// Supabase URL so the file bytes don't go through the function. Stops working once the data is deleted.
export async function GET(request: Request, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const sig = new URL(request.url).searchParams.get("sig");
  if (!UUID_RE.test(id) || !isValidFileSignature(id, sig)) return new Response("Arquivo não encontrado.", { status: 404 });

  const { data } = await db().from("attachments").select("path, filename").eq("id", id).maybeSingle();
  if (!data) return new Response("Arquivo não encontrado.", { status: 404 });

  const signed = await db()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(data.path, 60 * 60, { download: data.filename });
  if (signed.error) return new Response("Arquivo não encontrado.", { status: 404 });
  return Response.redirect(signed.data.signedUrl, 302);
}
