import { describe, expect, it } from "vitest";
import { signStripe, verifyStripeSignature } from "@/integrations/stripe/signature";
import { mapStripeEvent } from "@/integrations/stripe/process";

const ev = (type: string, o: object = {}) => ({
  id: "evt_1", type, data: { object: { id: "ch_1", amount: 4500, amount_refunded: 0, currency: "eur", status: "succeeded", created: 1795459703,
    description: "Acconto", billing_details: { email: " Mario@Example.com ", name: "Mario" }, ...o } },
});

describe("firma Stripe", () => {
  const body = '{"a":1}', secret = "whsec_test", now = 1_800_000_000;
  it("accetta una firma valida e rifiuta body, segreto e timestamp sbagliati", () => {
    const h = signStripe(body, secret, now);
    expect(verifyStripeSignature(body, h, secret, now + 10)).toBe(true);
    expect(verifyStripeSignature(body + " ", h, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, h, "whsec_altro", now)).toBe(false);
    expect(verifyStripeSignature(body, h, secret, now + 3600)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "t=abc,v1=00", secret, now)).toBe(false);
  });
  it("accetta più firme v1 (rotazione del segreto)", () => {
    const good = signStripe(body, secret, now).split("v1=")[1];
    expect(verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${good}`, secret, now)).toBe(true);
  });
});

describe("mappatura eventi Stripe", () => {
  it("charge.succeeded → pagamento in centesimi con email normalizzata", () => {
    expect(mapStripeEvent(ev("charge.succeeded"))).toMatchObject({ kind: "charge", chargeId: "ch_1", amount: 4500, refunded: 0, email: "mario@example.com", reference: "Acconto" });
  });
  it("legge l'id della balance transaction (stringa o oggetto espanso)", () => {
    expect(mapStripeEvent(ev("charge.succeeded", { balance_transaction: "txn_1" }))).toMatchObject({ balanceTransaction: "txn_1" });
    expect(mapStripeEvent(ev("charge.succeeded", { balance_transaction: { id: "txn_2", fee: 100 } }))).toMatchObject({ balanceTransaction: "txn_2" });
    expect(mapStripeEvent(ev("charge.succeeded"))).toMatchObject({ balanceTransaction: null });
  });
  it("charge.refunded → importo rimborsato cumulato", () => {
    expect(mapStripeEvent(ev("charge.refunded", { amount_refunded: 1500 }))).toMatchObject({ kind: "charge", refunded: 1500 });
  });
  it("ignora altri eventi e addebiti non riusciti; valuta diversa è un errore", () => {
    expect(mapStripeEvent(ev("customer.created"))).toEqual({ kind: "ignore" });
    expect(mapStripeEvent(ev("charge.succeeded", { status: "failed" }))).toEqual({ kind: "ignore" });
    expect(mapStripeEvent(ev("charge.succeeded", { currency: "usd" })).kind).toBe("error");
    expect(mapStripeEvent({ nope: 1 }).kind).toBe("error");
  });
});
