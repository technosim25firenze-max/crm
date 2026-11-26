import { describe, expect, it } from "vitest";
import { autoVatCents, centsToField, splitStored } from "@/lib/money";
import { grossCents, vatRateOf } from "@/lib/actions/fields";
import { opportunityCollectedCents, outstandingCents, summarizePayments, type PaymentRow } from "@/lib/finance";

describe("importo netto + IVA", () => {
  it("l'IVA automatica è il 22% del netto (0% per gli individui)", () => {
    expect(autoVatCents(10000)).toBe(2200);
    expect(autoVatCents(3333)).toBe(733);
    expect(autoVatCents(10000, 0)).toBe(0);
  });
  it("lordo = netto + IVA; IVA cancellata = nessuna IVA", () => {
    expect(grossCents(10000, 2200)).toBe(12200);
    expect(grossCents(10000, undefined)).toBe(10000);
    expect(grossCents(undefined, 2200)).toBeUndefined();
  });
  it("il valore salvato si riscompone in netto e IVA senza perdite", () => {
    expect(splitStored(12200, 2200)).toEqual({ net: "100,00", vat: "22,00" });
    expect(splitStored(5000, null)).toEqual({ net: "50,00", vat: "0,00" });
    expect(splitStored(null, null)).toEqual({ net: "", vat: undefined });
    expect(centsToField(123456)).toBe("1234,56");
  });
  it("l'aliquota salvata sul pagamento scorpora esattamente il netto inserito (anche con IVA a mano)", () => {
    const cases: [number, number][] = [[10000, 2200], [3333, 733], [100000, 12345], [1, 0], [99999, 1], [4550, 0], [12000, 3333]];
    for (const [net, vat] of cases) {
      const row: PaymentRow = { kind: "payment", amount_cents: net + vat, vat_rate: vatRateOf(net, vat), method: "cash", paid_at: "2026-11-10T10:00:00Z" };
      const s = summarizePayments([row]);
      expect(s.grossCents).toBe(net + vat);
      expect(Math.abs(s.netCents - net)).toBeLessThanOrEqual(1);
      expect(s.netCents + s.vatCents).toBe(s.grossCents);
    }
  });
  it("incassato lordo contro valore lordo: il residuo torna a zero quando si paga tutto", () => {
    const total = grossCents(10000, 2200)!;
    const paid = [{ kind: "payment", amount_cents: grossCents(4000, 880)! }, { kind: "payment", amount_cents: grossCents(6000, 1320)! }];
    expect(outstandingCents(total, opportunityCollectedCents(paid))).toBe(0);
    expect(outstandingCents(total, opportunityCollectedCents(paid.slice(0, 1)))).toBe(7320);
  });
});
