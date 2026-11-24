import { romeDayKey, romeMonthKey } from "./format";

export interface PaymentRow {
  kind: "payment" | "refund"; amount_cents: number; vat_rate: number; method: string; paid_at: string;
  contact_id?: string | null; service_id?: string | null;
}

const sign = (p: PaymentRow) => (p.kind === "refund" ? -1 : 1);
const netOf = (p: PaymentRow) => Math.round(p.amount_cents / (1 + p.vat_rate / 100));

export interface PaymentSummary {
  grossCents: number;      // incassato lordo al netto dei rimborsi
  netCents: number;        // incassato IVA esclusa, al netto dei rimborsi
  vatCents: number;
  refundsGrossCents: number;
  count: number;           // numero di incassi (non rimborsi)
  averageGrossCents: number;
  byMethod: Record<string, number>;   // lordo netto rimborsi
  byMonth: Record<string, number>;    // netto IVA, chiave YYYY-MM (Roma)
  byDay: Record<string, number>;      // netto IVA, chiave YYYY-MM-DD (Roma)
}

/** Riepilogo incassi. I rimborsi riducono l'incassato; l'IVA è scorporata per movimento con l'aliquota registrata. */
export function summarizePayments(rows: PaymentRow[]): PaymentSummary {
  const s: PaymentSummary = { grossCents: 0, netCents: 0, vatCents: 0, refundsGrossCents: 0, count: 0, averageGrossCents: 0, byMethod: {}, byMonth: {}, byDay: {} };
  let paymentsGross = 0;
  for (const p of rows) {
    const k = sign(p), net = netOf(p);
    s.grossCents += k * p.amount_cents;
    s.netCents += k * net;
    s.vatCents += k * (p.amount_cents - net);
    s.byMethod[p.method] = (s.byMethod[p.method] ?? 0) + k * p.amount_cents;
    const mk = romeMonthKey(p.paid_at);
    s.byMonth[mk] = (s.byMonth[mk] ?? 0) + k * net;
    const dk = romeDayKey(p.paid_at);
    s.byDay[dk] = (s.byDay[dk] ?? 0) + k * net;
    if (p.kind === "refund") s.refundsGrossCents += p.amount_cents;
    else { s.count++; paymentsGross += p.amount_cents; }
  }
  s.averageGrossCents = s.count ? Math.round(paymentsGross / s.count) : 0;
  return s;
}

/** Residuo da incassare: valore concordato meno incassato (netto rimborsi), mai negativo. */
export function outstandingCents(agreedCents: number | null | undefined, collectedCents: number): number {
  return Math.max(0, (agreedCents ?? 0) - collectedCents);
}

/**
 * Residuo di una prenotazione = totale − incassato dichiarato dalla piattaforma (già replicato come pagamento "booking_platform")
 * − pagamenti registrati a mano. I pagamenti della piattaforma non si sommano di nuovo: sono lo stesso denaro.
 */
export function bookingOutstandingCents(totalCents: number | null, declaredPaidCents: number, manualCollectedCents: number): number {
  return outstandingCents(totalCents, declaredPaidCents + manualCollectedCents);
}

export interface ExpenseRow { net_cents: number; vat_cents: number; category_kind?: "fixed" | "variable" | null }

export function summarizeExpenses(rows: ExpenseRow[]) {
  let net = 0, total = 0, fixed = 0, variable = 0;
  for (const e of rows) {
    net += e.net_cents; total += e.net_cents + e.vat_cents;
    if (e.category_kind === "variable") variable += e.net_cents; else fixed += e.net_cents;
  }
  return { netCents: net, totalCents: total, fixedNetCents: fixed, variableNetCents: variable };
}

/** Margine di contribuzione stimato = incassato netto IVA − spese nette. NON è utile contabile. */
export const contributionMarginCents = (collectedNet: number, expensesNet: number) => collectedNet - expensesNet;

export function growthPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Stato pagamento di una prenotazione manuale, calcolato dai pagamenti registrati (lordi) e dai rimborsi. */
export function manualPaymentStatus(totalCents: number | null, paymentsGross: number, refundsGross: number): "unpaid" | "partially_paid" | "paid" | "partially_refunded" | "refunded" {
  const collected = paymentsGross - refundsGross;
  if (paymentsGross > 0 && refundsGross > 0) return collected <= 0 ? "refunded" : "partially_refunded";
  if (collected <= 0) return "unpaid";
  return totalCents != null && totalCents > 0 && collected >= totalCents ? "paid" : "partially_paid";
}
