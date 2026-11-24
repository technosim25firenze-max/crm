import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Verifica HMAC-SHA256 (hex) del body grezzo. Accetta anche il prefisso "sha256=". Confronto a tempo costante. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const signBody = (rawBody: string, secret: string) => createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

const digest = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (given: string | null | undefined, secret: string) => !!given && timingSafeEqual(digest(given), digest(secret));

/**
 * Autenticazione del webhook. Metodi accettati (basta uno):
 * 1. firma HMAC-SHA256 del body in `x-signature`, `x-webhook-signature` o `x-hub-signature-256`;
 * 2. segreto condiviso in `Authorization: Bearer …`, `x-webhook-secret` o `x-webhook-token`;
 * 3. segreto nell'URL (`?token=…`), per piattaforme che permettono di configurare solo l'indirizzo.
 */
export function authenticateWebhook(rawBody: string, headers: Headers, url: URL, secret: string): "signature" | "secret" | "token" | null {
  for (const h of ["x-signature", "x-webhook-signature", "x-hub-signature-256"]) {
    if (verifySignature(rawBody, headers.get(h), secret)) return "signature";
  }
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (sameSecret(bearer, secret) || sameSecret(headers.get("x-webhook-secret"), secret) || sameSecret(headers.get("x-webhook-token"), secret)) return "secret";
  if (sameSecret(url.searchParams.get("token"), secret)) return "token";
  return null;
}
