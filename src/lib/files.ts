import "server-only";
import { deriveKey, hmacHex, safeEqual } from "@/lib/crypto";
import { appSecret, publicBaseUrl } from "@/lib/env";

// DataCrazy doesn't copy attachments: it stores the link we send. Signed Supabase URLs expire, so files
// are served by our own /files/<id>?sig=... route, which is permanent and stops working once the
// visitor's data is deleted.
function signature(attachmentId: string): string {
  return hmacHex(deriveKey(appSecret(), "files").toString("hex"), attachmentId).slice(0, 32);
}

export function fileUrl(attachmentId: string, requestUrl?: string): string {
  return `${publicBaseUrl(requestUrl)}/files/${attachmentId}?sig=${signature(attachmentId)}`;
}

export function isValidFileSignature(attachmentId: string, sig: string | null): boolean {
  return Boolean(sig) && safeEqual(sig!, signature(attachmentId));
}

export function sanitizeFilename(name: string): string {
  const clean = name
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f"\\/<>:|?*]/g, "_")
    .trim()
    .slice(0, 120);
  return clean || "arquivo";
}
