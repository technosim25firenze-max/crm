import { describe, expect, it } from "vitest";
import { parseEuro, vatSplit } from "@/lib/money";
import { bookingOutstandingCents, contributionMarginCents, growthPercent, outstandingCents, summarizeExpenses, summarizePayments, type PaymentRow } from "@/lib/finance";
import { previousRange, resolveRange } from "@/lib/dates";
import { romeWeekdayHour } from "@/lib/format";

const pay = (o: Partial<PaymentRow>): PaymentRow => ({ kind: "payment", amount_cents: 12200, vat_rate: 22, method: "cash", paid_at: "2026-11-10T10:00:00Z", ...o });

describe("importi", () => {
  it("interpreta i formati italiani e inglesi", () => {
    const cases: [string, number | null][] = [["1.234,50", 123450], ["12,5", 1250], ["12.50", 1250], ["€ 30", 3000], ["1.234", 123400], ["1,234.56", 123456], ["0,99", 99],
      ["", null], ["abc", null], ["-5", null], ["12,345", null], ["1.2.3,4", null]];
    for (const [i, o] of cases) expect(parseEuro(i), i).toBe(o);
  });
  it("scorpora l'IVA: lordo = netto + IVA", () => {
    expect(vatSplit(12200, 22)).toEqual({ net: 10000, vat: 2200 });
    const { net, vat } = vatSplit(3490, 22);
    expect(net + vat).toBe(3490);
    expect(vatSplit(1000, 0)).toEqual({ net: 1000, vat: 0 });
  });
});

describe("riepilogo incassi", () => {
  it("separa lordo e netto IVA, sottrae rimborsi parziali e totali", () => {
    const s = summarizePayments([pay({}), pay({ amount_cents: 6100, method: "card_pos" }), pay({ kind: "refund", amount_cents: 6100, method: "card_pos" })]);
    expect(s.grossCents).toBe(12200);
    expect(s.netCents).toBe(10000);
    expect(s.vatCents).toBe(2200);
    expect(s.refundsGrossCents).toBe(6100);
    expect(s.count).toBe(2);
    expect(s.averageGrossCents).toBe(9150);
    expect(s.byMethod).toEqual({ cash: 12200, card_pos: 0 });
  });
  it("raggruppa per mese a Roma (mezzanotte a cavallo del mese)", () => {
    const s = summarizePayments([pay({ paid_at: "2026-11-30T23:30:00Z" }), pay({ paid_at: "2026-11-30T22:30:00Z" })]);
    expect(s.byMonth).toEqual({ "2026-11": 10000, "2026-12": 10000 });
  });
  it("acconto non è incasso pieno: €1.000 concordati, €300 versati → residuo €700", () => {
    const collected = summarizePayments([pay({ amount_cents: 30000, vat_rate: 0 })]).grossCents;
    expect(outstandingCents(100000, collected)).toBe(70000);
    expect(outstandingCents(100000, 120000)).toBe(0);
    expect(outstandingCents(null, 0)).toBe(0);
  });
  it("residuo prenotazione: acconto della piattaforma + saldo in contanti registrato in sede", () => {
    expect(bookingOutstandingCents(9000, 4500, 0)).toBe(4500);
    expect(bookingOutstandingCents(9000, 4500, 4500)).toBe(0);
    expect(bookingOutstandingCents(9000, 4500, 9999)).toBe(0);
  });
  it("totale vuoto → zeri, nessuna divisione per zero", () => {
    expect(summarizePayments([]).averageGrossCents).toBe(0);
    expect(growthPercent(100, 0)).toBeNull();
    expect(growthPercent(150, 100)).toBe(50);
  });
});

describe("spese e margine", () => {
  it("distingue costi fissi e variabili; il margine è incassato netto − spese nette", () => {
    const e = summarizeExpenses([{ net_cents: 1000, vat_cents: 220, category_kind: "fixed" }, { net_cents: 500, vat_cents: 110, category_kind: "variable" }, { net_cents: 100, vat_cents: 0 }]);
    expect(e).toEqual({ netCents: 1600, totalCents: 1930, fixedNetCents: 1100, variableNetCents: 500 });
    expect(contributionMarginCents(10000, e.netCents)).toBe(8400);
  });
});

describe("intervalli di date (Europe/Rome)", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  it("oggi, ieri, mese, mese precedente, anno", () => {
    expect(resolveRange({ range: "today" }, now)).toMatchObject({ fromStr: "2026-11-20", toStr: "2026-11-20" });
    expect(resolveRange({ range: "yesterday" }, now)).toMatchObject({ fromStr: "2026-11-19", toStr: "2026-11-19" });
    expect(resolveRange({ range: "7d" }, now)).toMatchObject({ fromStr: "2026-11-14", toStr: "2026-11-20" });
    expect(resolveRange({ range: "prevmonth" }, now)).toMatchObject({ fromStr: "2026-10-01", toStr: "2026-10-31" });
    expect(resolveRange({ range: "year" }, now)).toMatchObject({ fromStr: "2026-01-01", toStr: "2026-11-20" });
    expect(resolveRange({}, now).key).toBe("month");
  });
  it("i confini sono mezzanotte di Roma", () => {
    const r = resolveRange({ range: "today" }, now);
    expect(r.from.toISOString()).toBe("2026-11-19T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-20T23:00:00.000Z");
    expect(resolveRange({ range: "custom", from: "2026-07-01", to: "2026-07-31" }, now).from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
  it("personalizzato non valido ricade sul mese; il precedente ha pari durata", () => {
    expect(resolveRange({ range: "custom", from: "2026-13-40", to: "x" }, now).key).toBe("month");
    expect(resolveRange({ range: "custom", from: "2026-11-10", to: "2026-11-01" }, now).key).toBe("month");
    const r = resolveRange({ range: "custom", from: "2026-11-10", to: "2026-11-19" }, now);
    const p = previousRange(r);
    expect(p.to.getTime()).toBe(r.from.getTime());
    expect(r.to.getTime() - r.from.getTime()).toBe(p.to.getTime() - p.from.getTime());
  });
  it("giorno e ora a Roma", () => {
    expect(romeWeekdayHour("2026-11-20T17:30:00Z")).toEqual({ weekday: 4, hour: 18 }); // venerdì 18:30 Roma
    expect(romeWeekdayHour("2026-11-22T23:30:00Z")).toEqual({ weekday: 0, hour: 0 }); // lunedì 00:30 Roma
  });
});

import { AD_SOURCES, bookingStats, marketingKpis, returningCustomers } from "@/lib/analytics";
describe("statistiche", () => {
  it("prenotazioni: giorno/ora a Roma, annullate escluse dall'occupazione, tasso no-show", () => {
    const s = bookingStats([
      { starts_at: "2026-11-20T17:00:00Z", status: "completed", resource_name: "Sim 1", service_name: "60 min" },
      { starts_at: "2026-11-20T17:30:00Z", status: "cancelled", resource_name: "Sim 1", service_name: "60 min" },
      { starts_at: "2026-11-21T09:00:00Z", status: "no_show", resource_name: "Sim 2", service_name: null },
    ]);
    expect(s.total).toBe(3);
    expect(s.byWeekday[4]).toBe(1); expect(s.byWeekday[5]).toBe(1); // ven 18:00 e sab 10:00
    expect(s.byHour[18]).toBe(1); expect(s.byHour[10]).toBe(1);
    expect(s.byResource).toEqual({ "Sim 1": 1, "Sim 2": 1 });
    expect(s.cancelled).toBe(1);
    expect(s.noShowRate).toBeCloseTo(1 / 3);
  });
  it("clienti ricorrenti da prenotazioni o incassi; annullate e rimborsi non contano", () => {
    const r = returningCustomers(
      [{ contact_id: "a", status: "completed" }, { contact_id: "a", status: "confirmed" }, { contact_id: "b", status: "completed" }, { contact_id: "b", status: "cancelled" }, { contact_id: null, status: "completed" }],
      [{ contact_id: "c", kind: "payment" }, { contact_id: "c", kind: "payment" }, { contact_id: "d", kind: "payment" }, { contact_id: "d", kind: "refund" }],
    );
    expect(r).toMatchObject({ customers: 4, returning: 2 });
    expect(returningCustomers([], null)).toEqual({ customers: 0, returning: 0, rate: 0 });
  });
  it("marketing: CPL e ROAS solo con spesa; nessun valore inventato", () => {
    expect(marketingKpis({ spendCents: 0, leads: 5, attributedNetCents: 1000, opportunities: 2, won: 1 })).toMatchObject({ cplCents: null, roas: null });
    const k = marketingKpis({ spendCents: 50000, leads: 10, attributedNetCents: 125000, opportunities: 4, won: 2, impressions: 10000, clicks: 200 });
    expect(k).toMatchObject({ cplCents: 5000, roas: 2.5, conversion: 0.2, ctr: 0.02, cpcCents: 250 });
    expect(AD_SOURCES).toContain("meta_lead_ads");
  });
});

import { manualPaymentStatus } from "@/lib/finance";
describe("stato pagamento prenotazione manuale", () => {
  it("non pagata, acconto, saldo, rimborsi", () => {
    expect(manualPaymentStatus(9000, 0, 0)).toBe("unpaid");
    expect(manualPaymentStatus(9000, 4500, 0)).toBe("partially_paid");
    expect(manualPaymentStatus(9000, 9000, 0)).toBe("paid");
    expect(manualPaymentStatus(9000, 9000, 3000)).toBe("partially_refunded");
    expect(manualPaymentStatus(9000, 9000, 9000)).toBe("refunded");
    expect(manualPaymentStatus(null, 100, 0)).toBe("partially_paid");
  });
});
