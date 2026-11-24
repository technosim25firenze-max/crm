"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { romeLocalToUtc } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import { dateField, euroField, positiveEuro, uuid } from "./fields";
import { errorState, logActivity, parseForm, type ActionState } from "./shared";
import { syncManualBookingPayment } from "./bookings";

const METHODS = ["cash", "card_pos", "bank_transfer", "gift_card", "other"] as const; // "stripe" solo dall'integrazione

const paymentSchema = z.object({
  amount: positiveEuro.refine((v) => v !== undefined, { message: t.validation.required }),
  method: z.enum(METHODS),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, t.validation.date).optional(),
  vat_rate: z.string().optional().transform((v, ctx) => {
    if (v === undefined) return 22;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) { ctx.addIssue({ code: "custom", message: t.validation.number }); return z.NEVER; }
    return n;
  }),
  reference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  contact_id: uuid, opportunity_id: uuid, booking_id: uuid, service_id: uuid,
});

function refresh(contactId?: string, opportunityId?: string) {
  revalidatePath("/finance"); revalidatePath("/dashboard"); revalidatePath("/analytics");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (opportunityId) revalidatePath(`/sales/${opportunityId}`);
}

export async function recordPayment(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "payments.record")) return errorState(t.common.notAllowed);
  const parsed = parseForm(paymentSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const paidAt = d.paid_at ? romeLocalToUtc(d.paid_at) : new Date();
  if (!paidAt) return { fieldErrors: { paid_at: t.validation.date } };
  const supabase = await createClient();

  // Avviso duplicati: stesso importo, stesso cliente o prenotazione, entro 24 ore. Il Stripe/POS potrebbe averlo già registrato.
  if (fd.get("confirm") !== "1" && (d.contact_id || d.booking_id)) {
    const from = new Date(paidAt.getTime() - 24 * 3600_000).toISOString();
    const to = new Date(paidAt.getTime() + 24 * 3600_000).toISOString();
    let q = supabase.from("payments").select("id", { head: true, count: "exact" }).eq("kind", "payment").eq("amount_cents", d.amount!).gte("paid_at", from).lte("paid_at", to);
    q = d.booking_id ? q.eq("booking_id", d.booking_id) : q.eq("contact_id", d.contact_id!);
    const { count } = await q;
    if (count) return { warning: t.finance.duplicateBody };
  }
  const { error } = await supabase.from("payments").insert({
    kind: "payment", amount_cents: d.amount, method: d.method, paid_at: paidAt.toISOString(), vat_rate: d.vat_rate,
    reference: d.reference ?? null, notes: d.notes ?? null, contact_id: d.contact_id ?? null, opportunity_id: d.opportunity_id ?? null,
    booking_id: d.booking_id ?? null, service_id: d.service_id ?? null, recorded_by: me.id,
  });
  if (error) return errorState();
  if (d.contact_id) await logActivity(supabase, { contact_id: d.contact_id, type: "payment", summary: "Pagamento registrato" });
  if (d.opportunity_id) await logActivity(supabase, { opportunity_id: d.opportunity_id, type: "payment", summary: "Pagamento registrato" });
  if (d.booking_id) { await syncManualBookingPayment(d.booking_id); revalidatePath(`/bookings/${d.booking_id}`); revalidatePath("/bookings"); }
  refresh(d.contact_id, d.opportunity_id);
  return { ok: true };
}

export async function recordRefund(paymentId: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "payments.record")) return errorState(t.common.notAllowed);
  const parsed = parseForm(z.object({ amount: positiveEuro.refine((v) => v !== undefined, { message: t.validation.required }), notes: z.string().max(1000).optional() }), fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { data: p } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  if (!p || p.kind !== "payment") return errorState();
  const { data: refunds } = await supabase.from("payments").select("amount_cents").eq("refund_of", paymentId).eq("kind", "refund");
  const remaining = p.amount_cents - (refunds ?? []).reduce((a, r) => a + r.amount_cents, 0);
  if (parsed.data.amount! > remaining) return { fieldErrors: { amount: t.finance.refundTooHigh } };
  const { error } = await supabase.from("payments").insert({
    kind: "refund", refund_of: paymentId, amount_cents: parsed.data.amount, vat_rate: p.vat_rate, method: p.method,
    contact_id: p.contact_id, company_id: p.company_id, opportunity_id: p.opportunity_id, booking_id: p.booking_id, service_id: p.service_id,
    notes: parsed.data.notes ?? null, recorded_by: me.id,
  });
  if (error) return errorState();
  if (p.booking_id) { await syncManualBookingPayment(p.booking_id); revalidatePath(`/bookings/${p.booking_id}`); revalidatePath("/bookings"); }
  refresh(p.contact_id ?? undefined, p.opportunity_id ?? undefined);
  return { ok: true };
}

export async function setReconciled(id: string, value: boolean) {
  const me = await getProfile();
  if (!can(me.role, "payments.record")) return;
  const supabase = await createClient();
  await supabase.from("payments").update({ reconciled: value }).eq("id", id);
  revalidatePath("/finance");
}

// ---------------------------------------------------------------- spese
const expenseSchema = z.object({
  spent_on: dateField,
  supplier: z.string().max(200).optional(),
  category_id: uuid,
  description: z.string().max(500).optional(),
  net: euroField.refine((v) => v !== undefined, { message: t.validation.required }),
  vat: euroField,
  payment_status: z.enum(["paid", "unpaid"]).default("paid"),
  method: z.enum(["cash", "card_pos", "bank_transfer", "other"]).optional(),
  document_url: z.url({ protocol: /^https?$/, message: t.validation.url }).max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

export async function createExpense(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "payments.record")) return errorState(t.common.notAllowed);
  const parsed = parseForm(expenseSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    spent_on: d.spent_on ?? undefined, supplier: d.supplier ?? null, category_id: d.category_id ?? null, description: d.description ?? null,
    net_cents: d.net, vat_cents: d.vat ?? 0, payment_status: d.payment_status, method: d.method ?? null,
    document_url: d.document_url ?? null, notes: d.notes ?? null,
  });
  if (error) return errorState();
  revalidatePath("/finance"); revalidatePath("/analytics");
  return { ok: true };
}

export async function setExpensePaid(id: string) {
  const me = await getProfile();
  if (!can(me.role, "payments.record")) return;
  const supabase = await createClient();
  await supabase.from("expenses").update({ payment_status: "paid" }).eq("id", id);
  revalidatePath("/finance");
}

export async function deleteExpense(id: string) {
  const me = await getProfile();
  if (!can(me.role, "payments.record")) return;
  const supabase = await createClient();
  await supabase.from("expenses").delete().eq("id", id);
  revalidatePath("/finance");
}
