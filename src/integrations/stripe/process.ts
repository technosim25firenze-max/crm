import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const PROVIDER = "stripe";
type Status = "processed" | "ignored" | "unmapped" | "failed";

const charge = z.object({
  id: z.string().min(1),
  amount: z.number().int().nonnegative(),
  amount_refunded: z.number().int().nonnegative().optional().default(0),
  currency: z.string(),
  status: z.string(),
  created: z.number().int(),
  description: z.string().nullish(),
  receipt_email: z.string().nullish(),
  balance_transaction: z.union([z.string(), z.object({ id: z.string() }).transform((o) => o.id)]).nullish(),
  billing_details: z.object({ email: z.string().nullish(), name: z.string().nullish() }).nullish(),
});
const eventSchema = z.object({ id: z.string().min(1), type: z.string(), data: z.object({ object: z.record(z.string(), z.unknown()) }) });

export type StripeMapped =
  | { kind: "ignore" }
  | { kind: "charge"; chargeId: string; balanceTransaction: string | null; amount: number; refunded: number; email: string | null; paidAt: string; reference: string }
  | { kind: "error"; reason: string };

/** Interpreta un evento Stripe: ci interessano solo gli addebiti riusciti (`charge.succeeded`) e i rimborsi (`charge.refunded`). */
export function mapStripeEvent(raw: unknown): StripeMapped {
  const ev = eventSchema.safeParse(raw);
  if (!ev.success) return { kind: "error", reason: "Evento Stripe non valido" };
  if (ev.data.type !== "charge.succeeded" && ev.data.type !== "charge.refunded") return { kind: "ignore" };
  const c = charge.safeParse(ev.data.data.object);
  if (!c.success) return { kind: "error", reason: "Addebito non valido: " + c.error.issues.map((i) => i.path.join(".")).join(", ").slice(0, 200) };
  if (c.data.status !== "succeeded") return { kind: "ignore" };
  if (c.data.currency.toLowerCase() !== "eur") return { kind: "error", reason: `Valuta non supportata: ${c.data.currency}` };
  if (c.data.amount <= 0) return { kind: "ignore" };
  const email = (c.data.billing_details?.email || c.data.receipt_email || "").trim().toLowerCase() || null;
  return {
    kind: "charge", chargeId: c.data.id, balanceTransaction: c.data.balance_transaction ?? null, amount: c.data.amount, refunded: Math.min(c.data.amount_refunded, c.data.amount), email,
    paidAt: new Date(c.data.created * 1000).toISOString(), reference: (c.data.description?.trim() || `Stripe ${c.data.id}`).slice(0, 200),
  };
}

/**
 * Commissione Stripe di un addebito, letta dalla "balance transaction" (non è nel payload del webhook).
 * Richiede STRIPE_SECRET_KEY; senza chiave o in caso di errore restituisce null e l'incasso resta valido senza commissione.
 */
export async function fetchStripeFee(balanceTransactionId: string | null): Promise<number | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !balanceTransactionId) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/balance_transactions/${encodeURIComponent(balanceTransactionId)}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const bt = z.object({ fee: z.number().int().nonnegative(), currency: z.string() }).safeParse(await res.json());
    return bt.success && bt.data.currency.toLowerCase() === "eur" ? bt.data.fee : null;
  } catch { return null; }
}

/** Elabora un evento già salvato. Idempotente: pagamento per `charge.id`, rimborsi per differenza cumulata. */
export async function processStripeEvent(
  admin: SupabaseClient, ev: { id: string; payload: unknown; attempts: number },
): Promise<{ status: Status; error?: string }> {
  const finish = async (status: Status, last_error: string | null = null) =>
    admin.from("webhook_events").update({ status, last_error, attempts: ev.attempts + 1, processed_at: new Date().toISOString() }).eq("id", ev.id);
  const m = mapStripeEvent(ev.payload);
  if (m.kind === "ignore") { await finish("ignored"); return { status: "ignored" }; }
  if (m.kind === "error") { await finish("unmapped", m.reason); return { status: "unmapped", error: m.reason }; }

  const fail = async (message: string) => { await finish("failed", message.slice(0, 500)); return { status: "failed" as const, error: message }; };

  let contactId: string | null = null;
  if (m.email) {
    const { data } = await admin.from("contacts").select("id").eq("email_norm", m.email).is("archived_at", null).order("created_at").limit(1);
    contactId = data?.[0]?.id ?? null;
  }
  let { data: orig } = await admin.from("payments").select("id,stripe_fee_cents").eq("source", "stripe").eq("external_id", m.chargeId).maybeSingle();
  if (!orig) {
    const fee = await fetchStripeFee(m.balanceTransaction);
    const ins = await admin.from("payments").insert({
      kind: "payment", amount_cents: m.amount, vat_rate: 22, method: "stripe", paid_at: m.paidAt, reference: m.reference,
      source: "stripe", external_id: m.chargeId, contact_id: contactId, recorded_by: null, stripe_fee_cents: fee,
    }).select("id,stripe_fee_cents").single();
    if (ins.error && ins.error.code !== "23505") return fail(ins.error.message);
    orig = ins.data ?? (await admin.from("payments").select("id,stripe_fee_cents").eq("source", "stripe").eq("external_id", m.chargeId).maybeSingle()).data;
  }
  if (!orig) return fail("Pagamento non trovato dopo l'inserimento");
  if (orig.stripe_fee_cents == null) {
    // Recupero tardivo (es. chiave segreta aggiunta dopo il primo incasso).
    const fee = await fetchStripeFee(m.balanceTransaction);
    if (fee != null) await admin.from("payments").update({ stripe_fee_cents: fee }).eq("id", orig.id);
  }

  if (m.refunded > 0) {
    const { data: rs } = await admin.from("payments").select("amount_cents").eq("kind", "refund").eq("refund_of", orig.id);
    const already = (rs ?? []).reduce((a, r) => a + (r.amount_cents as number), 0);
    if (m.refunded > already) {
      const { data: o } = await admin.from("payments").select("contact_id,booking_id,opportunity_id,vat_rate").eq("id", orig.id).single();
      const r = await admin.from("payments").insert({
        kind: "refund", refund_of: orig.id, amount_cents: m.refunded - already, vat_rate: o?.vat_rate ?? 22, method: "stripe",
        reference: m.reference, source: "stripe", external_id: `${m.chargeId}#refund-${m.refunded}`, contact_id: o?.contact_id ?? null,
        booking_id: o?.booking_id ?? null, opportunity_id: o?.opportunity_id ?? null, recorded_by: null,
      });
      if (r.error && r.error.code !== "23505") return fail(r.error.message);
    }
  }
  await finish("processed");
  return { status: "processed" };
}
