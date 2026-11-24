import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWebhook } from "@/integrations/bookings/signature";
import { PROVIDER, processWebhookEvent } from "@/integrations/bookings/process";

const MAX_BYTES = 1024 * 1024;
const MAX_EVENTS = 50;
const json = (status: number, body: object, requestId: string) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
const fail = (status: number, code: string, message: string, requestId: string) => json(status, { error: { code, message } }, requestId);

/**
 * Riceve gli eventi della piattaforma di prenotazione (array o singolo evento JSON).
 * Autenticazione: firma HMAC, segreto in header oppure `?token=` (vedi `authenticateWebhook`).
 * Idempotente per `id` evento. Eventi di test confermati (200) senza creare prenotazioni.
 */
export async function POST(request: Request) {
  const requestId = randomUUID();
  const secret = process.env.BOOKINGS_WEBHOOK_SECRET;
  if (!secret) return fail(503, "NOT_CONFIGURED", "Webhook non configurato", requestId);

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "Payload troppo grande", requestId);
  if (!authenticateWebhook(raw, request.headers, new URL(request.url), secret)) return fail(401, "UNAUTHORIZED", "Autenticazione non valida", requestId);

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return fail(400, "INVALID_JSON", "JSON non valido", requestId); }
  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0 || events.length > MAX_EVENTS) return fail(400, "INVALID_BATCH", "Numero di eventi non valido", requestId);

  const admin = createAdminClient();
  if (!admin) return fail(503, "NOT_CONFIGURED", "Chiave di servizio mancante", requestId);

  const results: { id: string; status: string; booking_id?: string; reason?: string }[] = [];
  for (const ev of events) {
    const evId = typeof ev === "object" && ev !== null && typeof (ev as { id?: unknown }).id === "string" ? (ev as { id: string }).id.slice(0, 200) : null;
    const dedupeKey = evId ?? createHash("sha256").update(JSON.stringify(ev)).digest("hex");
    const inserted = await admin.from("webhook_events").insert({ provider: PROVIDER, dedupe_key: dedupeKey, payload: ev })
      .select("id,payload,received_at,attempts").single();
    let row = inserted.data;
    if (inserted.error) {
      if (inserted.error.code !== "23505") return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
      const existing = await admin.from("webhook_events").select("id,payload,received_at,attempts,status").eq("provider", PROVIDER).eq("dedupe_key", dedupeKey).single();
      if (!existing.data) return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
      if (existing.data.status === "processed" || existing.data.status === "ignored") { results.push({ id: dedupeKey, status: "duplicate" }); continue; }
      row = existing.data; // fallita o non riconosciuta: si riprova
    }
    if (!row) return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
    const r = await processWebhookEvent(admin, row);
    results.push({ id: dedupeKey, status: r.status === "ignored" ? "test_received" : r.status, booking_id: r.bookingId, reason: r.status === "unmapped" ? r.error : undefined });
  }
  if (results.some((r) => r.status === "failed")) return fail(500, "PROCESSING_FAILED", "Elaborazione fallita, riprovare", requestId); // il mittente può ritentare
  const status = results.some((r) => r.status === "unmapped") ? 202 : 200;
  return json(status, { data: { results }, meta: { requestId } }, requestId);
}
