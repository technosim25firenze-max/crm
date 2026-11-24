import { z } from "zod";

/**
 * Formato reale del webhook della piattaforma di prenotazione (importi in EURO, date ISO con offset):
 * `[{ id, type, version, created_at, data: { payment, bookings[], customer, attribution, checkout_id } }]`
 * Un evento può contenere più prenotazioni dello stesso checkout.
 */
const num = z.number().finite().nonnegative();
const nullableStr = z.string().nullish();

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().max(100),
  created_at: z.string().optional(),
  data: z.object({
    checkout_id: nullableStr,
    payment: z.object({
      total: num.nullish(), paid_amount: num.nullish(), balance_due: num.nullish(), option: nullableStr, currency: nullableStr,
    }).passthrough().nullish(),
    customer: z.object({
      name: nullableStr, surname: nullableStr, email: nullableStr, phone: nullableStr, type: nullableStr,
      marketing_consent: z.object({ granted_at: nullableStr, text_version: nullableStr }).passthrough().nullish(),
    }).passthrough().nullish(),
    attribution: z.record(z.string(), z.unknown()).nullish(),
    bookings: z.array(z.object({
      id: z.string().min(1).max(200),
      status: z.string(),
      start_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "start_at non valido"),
      end_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "end_at non valido"),
      cost_amount: num.nullish(),
      booking_label: nullableStr, booking_number: z.number().int().nullish(),
      simulators: z.array(z.object({ id: z.string().optional(), code: nullableStr }).passthrough()).nullish(),
      simulators_count: z.number().int().nullish(), extra_services: z.array(z.unknown()).nullish(),
      promo_discount_percentage: z.number().nullish(),
    }).passthrough()).min(1),
  }).passthrough(),
}).passthrough();

export interface MappedBooking {
  source: "website"; external_id: string; booking_number: number | null; status: BookingStatus; payment_status: PaymentStatus;
  customer_name: string | null; customer_surname: string | null; customer_email: string | null; customer_phone: string | null;
  service_name: string | null; resource_name: string | null; starts_at: string; ends_at: string;
  total_cents: number | null; paid_cents: number; currency: "EUR"; checkout_id: string | null;
  details: Record<string, unknown>; attribution: Record<string, string>; marketing_consent: { granted_at?: string; text_version?: string } | null;
}
type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
type PaymentStatus = "unpaid" | "partially_paid" | "paid";

export type EventMap =
  | { ok: true; kind: "test" }
  | { ok: true; kind: "bookings"; eventAt: string; bookings: MappedBooking[] }
  | { ok: false; reason: string };

const STATUS: Record<string, BookingStatus> = {
  PENDING: "pending", CONFIRMED: "confirmed", COMPLETED: "completed", CANCELLED: "cancelled", CANCELED: "cancelled",
  NO_SHOW: "no_show", NOSHOW: "no_show",
};
export const cents = (euro: number) => Math.round(euro * 100);
const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Ripartisce l'incassato del checkout tra le prenotazioni in proporzione al costo; il resto va all'ultima. */
export function allocatePaid(paid: number, costs: number[]): number[] {
  if (costs.length === 1) return [paid];
  const total = costs.reduce((a, b) => a + b, 0);
  if (total === 0) return costs.map((_, i) => (i === 0 ? paid : 0));
  const out = costs.map((c) => Math.round((paid * c) / total));
  out[out.length - 1] += paid - out.reduce((a, b) => a + b, 0);
  return out;
}

export function paymentStatusOf(paidCents: number, totalCents: number | null): PaymentStatus {
  if (paidCents <= 0) return "unpaid";
  return totalCents != null && totalCents > 0 && paidCents >= totalCents ? "paid" : "partially_paid";
}

export function mapEvent(raw: unknown, receivedAt: Date = new Date()): EventMap {
  const type = typeof raw === "object" && raw !== null ? (raw as { type?: unknown }).type : undefined;
  if (typeof type === "string" && /(^|[.:_-])test($|[.:_-])/i.test(type)) return { ok: true, kind: "test" };
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join(".") || "evento"}: ${i.message}`).join("; ").slice(0, 500) };
  const { data, created_at } = parsed.data;

  const bookings: MappedBooking[] = [];
  const costs = data.bookings.map((b) => cents(b.cost_amount ?? 0));
  const paidTotal = cents(data.payment?.paid_amount ?? 0);
  const paid = allocatePaid(paidTotal, costs);
  const attribution = Object.fromEntries(Object.entries(data.attribution ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, (v as string).trim()]));
  const consent = data.customer?.marketing_consent;

  for (const [i, b] of data.bookings.entries()) {
    const status = STATUS[b.status.trim().toUpperCase().replace(/[\s-]/g, "_")];
    if (!status) return { ok: false, reason: `Stato prenotazione sconosciuto: ${b.status}` };
    if (Date.parse(b.end_at) < Date.parse(b.start_at)) return { ok: false, reason: "end_at precedente a start_at" };
    const codes = (b.simulators ?? []).map((s) => clean(s.code)).filter((x): x is string => !!x);
    bookings.push({
      source: "website", external_id: b.id, booking_number: b.booking_number ?? null, status,
      payment_status: paymentStatusOf(paid[i], costs[i]),
      customer_name: clean(data.customer?.name), customer_surname: clean(data.customer?.surname),
      customer_email: clean(data.customer?.email), customer_phone: clean(data.customer?.phone),
      service_name: clean(b.booking_label), resource_name: codes.length ? codes.join(", ") : null,
      starts_at: new Date(b.start_at).toISOString(), ends_at: new Date(b.end_at).toISOString(),
      total_cents: b.cost_amount != null ? costs[i] : null, paid_cents: paid[i], currency: "EUR", checkout_id: clean(data.checkout_id),
      details: {
        payment_option: data.payment?.option ?? null, balance_due_cents: data.payment?.balance_due != null ? cents(data.payment.balance_due) : null,
        checkout_total_cents: data.payment?.total != null ? cents(data.payment.total) : null, simulators: b.simulators ?? [],
        simulators_count: b.simulators_count ?? null, extra_services: b.extra_services ?? [], promo_discount_percentage: b.promo_discount_percentage ?? null,
        customer_type: data.customer?.type ?? null,
      },
      attribution,
      marketing_consent: consent?.granted_at ? { granted_at: new Date(consent.granted_at).toISOString(), text_version: consent.text_version ?? undefined } : null,
    });
  }
  const at = created_at && !Number.isNaN(Date.parse(created_at)) ? new Date(created_at) : receivedAt;
  return { ok: true, kind: "bookings", eventAt: at.toISOString(), bookings };
}
