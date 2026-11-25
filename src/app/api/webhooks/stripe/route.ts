import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/integrations/stripe/signature";
import { PROVIDER, processStripeEvent } from "@/integrations/stripe/process";

const MAX_BYTES = 1024 * 1024;
const reply = (status: number, body: object, requestId: string) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
const fail = (status: number, code: string, message: string, requestId: string) => reply(status, { error: { code, message } }, requestId);

/** Webhook Stripe: firma verificata sul body grezzo, idempotente per `event.id`. Registra incassi e rimborsi. */
export async function POST(request: Request) {
  const requestId = randomUUID();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return fail(503, "NOT_CONFIGURED", "Webhook Stripe non configurato", requestId);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "Payload troppo grande", requestId);
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) return fail(400, "INVALID_SIGNATURE", "Firma non valida", requestId);

  let event: { id?: unknown };
  try { event = JSON.parse(raw); } catch { return fail(400, "INVALID_JSON", "JSON non valido", requestId); }
  if (typeof event?.id !== "string" || !event.id) return fail(400, "INVALID_EVENT", "Evento non valido", requestId);

  const admin = createAdminClient();
  if (!admin) return fail(503, "NOT_CONFIGURED", "Chiave di servizio mancante", requestId);

  const inserted = await admin.from("webhook_events").insert({ provider: PROVIDER, dedupe_key: event.id, payload: event }).select("id,payload,attempts").single();
  let row = inserted.data;
  if (inserted.error) {
    if (inserted.error.code !== "23505") return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
    const existing = await admin.from("webhook_events").select("id,payload,attempts,status").eq("provider", PROVIDER).eq("dedupe_key", event.id).single();
    if (!existing.data) return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
    if (existing.data.status === "processed" || existing.data.status === "ignored") return reply(200, { data: { status: "duplicate" } }, requestId);
    row = existing.data;
  }
  if (!row) return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
  const r = await processStripeEvent(admin, row);
  if (r.status === "failed") return fail(500, "PROCESSING_FAILED", "Elaborazione fallita, riprovare", requestId); // Stripe ritenta
  return reply(200, { data: { status: r.status } }, requestId);
}
