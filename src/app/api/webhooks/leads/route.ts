import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWebhook } from "@/integrations/bookings/signature";
import { PROVIDER, processLeadEvent } from "@/integrations/leads/process";

const MAX_BYTES = 256 * 1024;
const reply = (status: number, body: object, requestId: string) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
const fail = (status: number, code: string, message: string, requestId: string) => reply(status, { error: { code, message } }, requestId);

/**
 * Riceve i lead dei moduli Facebook/Instagram inviati da Make (POST JSON, un lead o un array).
 * Autenticazione: `?token=…`, header (Bearer / x-webhook-secret) o firma HMAC. Idempotente per `leadgenId`.
 */
export async function POST(request: Request) {
  const requestId = randomUUID();
  const secret = (process.env.LEADS_WEBHOOK_SECRET || process.env.BOOKINGS_WEBHOOK_SECRET)?.trim();
  if (!secret) return fail(503, "NOT_CONFIGURED", "Webhook non configurato", requestId);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, "PAYLOAD_TOO_LARGE", "Payload troppo grande", requestId);
  if (!authenticateWebhook(raw, request.headers, new URL(request.url), secret)) return fail(401, "UNAUTHORIZED", "Autenticazione non valida", requestId);

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return fail(400, "INVALID_JSON", "JSON non valido", requestId); }
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0 || items.length > 20) return fail(400, "INVALID_BATCH", "Numero di lead non valido", requestId);

  const admin = createAdminClient();
  if (!admin) return fail(503, "NOT_CONFIGURED", "Chiave di servizio mancante", requestId);

  const results: { id: string; status: string; reason?: string }[] = [];
  for (const item of items) {
    const lid = typeof item === "object" && item !== null ? (item as { leadgenId?: unknown }).leadgenId : undefined;
    const dedupeKey = typeof lid === "string" || typeof lid === "number" ? String(lid).slice(0, 200) : createHash("sha256").update(JSON.stringify(item)).digest("hex");
    const inserted = await admin.from("webhook_events").insert({ provider: PROVIDER, dedupe_key: dedupeKey, payload: item }).select("id,payload,attempts").single();
    let row = inserted.data;
    if (inserted.error) {
      if (inserted.error.code !== "23505") return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
      const existing = await admin.from("webhook_events").select("id,payload,attempts,status").eq("provider", PROVIDER).eq("dedupe_key", dedupeKey).single();
      if (!existing.data) return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
      if (existing.data.status === "processed" || existing.data.status === "ignored") { results.push({ id: dedupeKey, status: "duplicate" }); continue; }
      row = existing.data;
    }
    if (!row) return fail(500, "STORE_FAILED", "Salvataggio non riuscito", requestId);
    const r = await processLeadEvent(admin, row);
    results.push({ id: dedupeKey, status: r.status === "ignored" ? "test_received" : r.status, reason: r.status === "unmapped" ? r.error : undefined });
  }
  if (results.some((r) => r.status === "failed")) return fail(500, "PROCESSING_FAILED", "Elaborazione fallita, riprovare", requestId);
  return reply(results.some((r) => r.status === "unmapped") ? 202 : 200, { data: { results }, meta: { requestId } }, requestId);
}
