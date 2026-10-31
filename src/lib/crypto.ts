import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// All functions take the master secret explicitly so they stay pure and testable.
// Callers pass appSecret() from "@/lib/env".

export function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

// Compares digests of both values, so neither length nor content leaks through timing.
export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// One independent key per purpose, so a token signed for the admin cookie can never be
// accepted as a visitor session and vice versa.
export function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "datacrazy-webchat", purpose, 32));
}

// AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
export function encrypt(secret: string, plaintext: string, purpose = "settings"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, `enc:${purpose}`), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decrypt(secret: string, payload: string, purpose = "settings"): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || ciphertext === undefined) throw new Error("Formato de dado criptografado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, `enc:${purpose}`), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

// Stateless signed token: <base64url(json)>.<hmac>. `exp` is a unix timestamp in seconds.
export function signToken(secret: string, purpose: string, payload: Record<string, unknown>, ttlSeconds?: number): string {
  const body = { ...payload, ...(ttlSeconds ? { exp: Math.floor(Date.now() / 1000) + ttlSeconds } : {}) };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${createHmac("sha256", deriveKey(secret, `sig:${purpose}`))
    .update(encoded)
    .digest("base64url")}`;
}

export function verifyToken<T extends Record<string, unknown>>(
  secret: string,
  purpose: string,
  token: string | undefined | null,
): T | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", deriveKey(secret, `sig:${purpose}`))
    .update(encoded)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// Signature header sent to DataCrazy, in the format its hmac-sha256 validation accepts.
export function webhookSignature(webhookSecret: string, body: string): string {
  return `sha256=${hmacHex(webhookSecret, body)}`;
}
