import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { authenticateWebhook, signBody, verifySignature } from "@/integrations/bookings/signature";
import { allocatePaid, mapEvent, paymentStatusOf, type MappedBooking } from "@/integrations/bookings/mapper";
import { addUser, asUser, createDb } from "./db";

// Esempio reale ricevuto dalla piattaforma (evento di prova), con tipo cambiato per simulare un evento vero.
const SAMPLE = [{
  id: "webhook.test:1795459703873",
  data: {
    payment: { total: 90, option: "DEPOSIT", numbers: [1234], currency: "EUR", balance_due: 45, paid_amount: 45 },
    bookings: [{
      id: "bkg_esempio", end_at: "2026-12-01T19:00:00+01:00", status: "CONFIRMED", start_at: "2026-12-01T18:00:00+01:00", timezone: "Europe/Rome",
      simulators: [{ id: "sim_esempio", code: "SIM-STATIC-1" }], cost_amount: 90, booking_label: "Prenotazione 1h", booking_number: 567,
      extra_services: [], simulators_count: 1, promo_discount_percentage: null,
    }],
    customer: { name: "Mario Rossi", type: "GUEST", email: "mario.rossi@example.com", phone: "+39 333 1234567", surname: null,
      marketing_consent: { granted_at: "2026-11-22T10:00:00.000Z", text_version: "2026-11-v1" } },
    attribution: { utm_term: null, utm_medium: "social", utm_source: "instagram", utm_content: null, landing_page: null, utm_campaign: "esempio" },
    checkout_id: "chk_esempio",
  },
  type: "webhook.test", version: 1, created_at: "2026-11-23T18:48:23.873Z",
}];
const real = (over: object = {}) => ({ ...SAMPLE[0], type: "booking.created", ...over });

describe("autenticazione webhook", () => {
  const body = '{"a":1}', url = (q = "") => new URL(`https://x.test/api/webhooks/bookings${q}`);
  it("firma HMAC corretta, anche con prefisso e in header alternativi", () => {
    const sig = signBody(body, "s3cret");
    expect(verifySignature(body, sig, "s3cret")).toBe(true);
    expect(verifySignature(body, `sha256=${sig.toUpperCase()}`, "s3cret")).toBe(true);
    expect(authenticateWebhook(body, new Headers({ "x-hub-signature-256": `sha256=${sig}` }), url(), "s3cret")).toBe("signature");
  });
  it("segreto in header o nell'URL", () => {
    expect(authenticateWebhook(body, new Headers({ authorization: "Bearer s3cret" }), url(), "s3cret")).toBe("secret");
    expect(authenticateWebhook(body, new Headers({ "x-webhook-secret": "s3cret" }), url(), "s3cret")).toBe("secret");
    expect(authenticateWebhook(body, new Headers(), url("?token=s3cret"), "s3cret")).toBe("token");
  });
  it("rifiuta tutto il resto", () => {
    expect(authenticateWebhook(body, new Headers(), url(), "s3cret")).toBeNull();
    expect(authenticateWebhook(body, new Headers(), url("?token=sbagliato"), "s3cret")).toBeNull();
    expect(authenticateWebhook(body, new Headers({ "x-signature": signBody('{"a":2}', "s3cret") }), url(), "s3cret")).toBeNull();
    expect(authenticateWebhook(body, new Headers({ authorization: "Bearer " }), url("?token="), "s3cret")).toBeNull();
    expect(verifySignature(body, "abc", "s3cret")).toBe(false);
  });
});

describe("mapper sul formato reale", () => {
  it("l'evento di prova è riconosciuto come test", () => {
    expect(mapEvent(SAMPLE[0])).toEqual({ ok: true, kind: "test" });
  });
  it("converte euro in centesimi, stato, simulatore, cliente, consenso e attribuzione", () => {
    const m = mapEvent(real());
    expect(m.ok && m.kind === "bookings").toBe(true);
    if (!m.ok || m.kind !== "bookings") return;
    const b = m.bookings[0];
    expect(b).toMatchObject({
      external_id: "bkg_esempio", booking_number: 567, status: "confirmed", payment_status: "partially_paid",
      customer_name: "Mario Rossi", customer_surname: null, customer_email: "mario.rossi@example.com",
      service_name: "Prenotazione 1h", resource_name: "SIM-STATIC-1", total_cents: 9000, paid_cents: 4500, checkout_id: "chk_esempio",
      starts_at: "2026-12-01T17:00:00.000Z", ends_at: "2026-12-01T18:00:00.000Z",
    });
    expect(b.details).toMatchObject({ payment_option: "DEPOSIT", balance_due_cents: 4500 });
    expect(b.attribution).toEqual({ utm_medium: "social", utm_source: "instagram", utm_campaign: "esempio" }); // i null sono scartati
    expect(b.marketing_consent).toEqual({ granted_at: "2026-11-22T10:00:00.000Z", text_version: "2026-11-v1" });
  });
  it("più prenotazioni nello stesso checkout: l'incassato è ripartito senza perdere centesimi", () => {
    expect(allocatePaid(100, [3333, 3333, 3334]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocatePaid(4500, [9000])).toEqual([4500]);
    expect(allocatePaid(50, [0, 0])).toEqual([50, 0]);
    expect(paymentStatusOf(0, 9000)).toBe("unpaid");
    expect(paymentStatusOf(4500, 9000)).toBe("partially_paid");
    expect(paymentStatusOf(9000, 9000)).toBe("paid");
    expect(paymentStatusOf(100, null)).toBe("partially_paid");
  });
  it("stati in maiuscolo/minuscolo; stato sconosciuto → non riconosciuto (mai indovinato)", () => {
    const withStatus = (status: string) => real({ data: { ...SAMPLE[0].data, bookings: [{ ...SAMPLE[0].data.bookings[0], status }] } });
    for (const [s, e] of [["CANCELLED", "cancelled"], ["canceled", "cancelled"], ["No-Show", "no_show"], ["COMPLETED", "completed"], ["PENDING", "pending"]]) {
      const m = mapEvent(withStatus(s));
      expect(m.ok && m.kind === "bookings" && m.bookings[0].status).toBe(e);
    }
    expect(mapEvent(withStatus("STRANO"))).toMatchObject({ ok: false, reason: expect.stringContaining("STRANO") });
  });
  it("dati non validi non lanciano eccezioni", () => {
    for (const bad of [null, "x", [], {}, { id: "1", type: "x", data: {} }, real({ data: { bookings: [] } }),
      real({ data: { ...SAMPLE[0].data, bookings: [{ ...SAMPLE[0].data.bookings[0], end_at: "2026-12-01T10:00:00+01:00" }] } }),
      real({ data: { ...SAMPLE[0].data, payment: { paid_amount: -5 } } })]) {
      expect(mapEvent(bad).ok).toBe(false);
    }
  });
});

describe("upsert_booking (SQL)", () => {
  let db: PGlite;
  const up = async (p: object) => (await db.query<{ id: string }>("select upsert_booking($1::jsonb) as id", [JSON.stringify(p)])).rows[0].id;
  const fromSample = (over: Partial<MappedBooking> & { event_at?: string } = {}) => {
    const m = mapEvent(real());
    if (!m.ok || m.kind !== "bookings") throw new Error("mapper");
    return { ...m.bookings[0], event_at: "2026-11-23T18:48:23.873Z", ...over };
  };
  beforeAll(async () => { db = await createDb(); });

  it("evento reale: crea prenotazione, contatto con origine/UTM, consenso, pagamento dell'acconto", async () => {
    const id = await up(fromSample());
    const b = (await db.query<{ contact_id: string; total_cents: number; paid_cents: number; payment_status: string }>("select contact_id,total_cents,paid_cents,payment_status from bookings where id=$1", [id])).rows[0];
    expect(b).toMatchObject({ total_cents: 9000, paid_cents: 4500, payment_status: "partially_paid" });
    const c = (await db.query<{ first_name: string; source: string; campaign: string; attribution_status: string; utm: { utm_source: string } }>("select first_name,source,campaign,attribution_status,utm from contacts where id=$1", [b.contact_id])).rows[0];
    expect(c).toMatchObject({ first_name: "Mario Rossi".split(" ")[0], source: "instagram_organic", campaign: "esempio", attribution_status: "unknown" });
    expect(c.utm.utm_source).toBe("instagram");
    expect((await db.query("select 1 from marketing_consents where contact_id=$1 and channel='email' and status='granted'", [b.contact_id])).rows).toHaveLength(1);
    const pays = (await db.query<{ amount_cents: number; source: string; booking_id: string }>("select amount_cents,source,booking_id from payments")).rows;
    expect(pays).toEqual([{ amount_cents: 4500, source: "booking_platform", booking_id: id }]);
  });
  it("consegna ripetuta: nessun duplicato di prenotazione, consenso o pagamento", async () => {
    await up(fromSample());
    expect((await db.query("select 1 from bookings")).rows).toHaveLength(1);
    expect((await db.query("select 1 from marketing_consents")).rows).toHaveLength(1);
    expect((await db.query("select 1 from payments")).rows).toHaveLength(1);
  });
  it("saldo pagato dopo: si aggiunge solo la differenza", async () => {
    await up(fromSample({ paid_cents: 9000, payment_status: "paid", event_at: "2026-11-24T10:00:00Z" }));
    const p = (await db.query<{ amount_cents: number }>("select amount_cents from payments order by amount_cents")).rows.map((r) => r.amount_cents);
    expect(p).toEqual([4500, 4500]);
    expect((await db.query<{ payment_status: string }>("select payment_status from bookings")).rows[0].payment_status).toBe("paid");
  });
  it("evento più vecchio ignorato (stato e pagamenti invariati)", async () => {
    await up(fromSample({ status: "cancelled", paid_cents: 0, payment_status: "unpaid", event_at: "2026-11-23T00:00:00Z" }));
    const b = (await db.query<{ status: string; paid_cents: number }>("select status,paid_cents from bookings")).rows[0];
    expect(b).toEqual({ status: "confirmed", paid_cents: 9000 });
  });
  it("utente esistente: collegato per email, il suo canale d'origine non cambia", async () => {
    const existing = (await db.query<{ id: string }>("insert into contacts (first_name,email,source) values ('Anna','anna@example.com','walk_in') returning id")).rows[0].id;
    const id = await up(fromSample({ external_id: "bkg_2", customer_name: "Anna", customer_email: "ANNA@example.com", checkout_id: "chk_2", paid_cents: 0, payment_status: "unpaid" }));
    expect((await db.query<{ contact_id: string }>("select contact_id from bookings where id=$1", [id])).rows[0].contact_id).toBe(existing);
    expect((await db.query<{ source: string }>("select source from contacts where id=$1", [existing])).rows[0].source).toBe("walk_in");
  });
  it("traffico a pagamento → Meta Ads / marketing; senza UTM → accesso diretto", async () => {
    await up(fromSample({ external_id: "bkg_3", customer_name: "Paolo", customer_surname: "Neri", customer_email: "p@example.com", customer_phone: null, paid_cents: 0, payment_status: "unpaid",
      attribution: { utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "natale" }, marketing_consent: null }));
    await up(fromSample({ external_id: "bkg_4", customer_name: "Sara", customer_email: "s@example.com", customer_phone: null, paid_cents: 0, payment_status: "unpaid", attribution: {}, marketing_consent: null }));
    const rows = (await db.query<{ first_name: string; last_name: string | null; source: string; attribution_status: string }>("select first_name,last_name,source,attribution_status from contacts where first_name in ('Paolo','Sara') order by first_name")).rows;
    expect(rows).toEqual([
      { first_name: "Paolo", last_name: "Neri", source: "meta_ads", attribution_status: "marketing" },
      { first_name: "Sara", last_name: null, source: "direct", attribution_status: "unknown" },
    ]);
  });
  it("il consenso non viene registrato senza email; i pagamenti si disattivano da impostazione", async () => {
    await db.query("update organization_settings set import_platform_payments=false");
    await up(fromSample({ external_id: "bkg_5", customer_name: "Gigi", customer_email: null, customer_phone: "340 555 1212", checkout_id: "chk_5" }));
    expect((await db.query("select 1 from payments where booking_id=(select id from bookings where external_id='bkg_5')")).rows).toHaveLength(0);
    expect((await db.query("select 1 from marketing_consents m join contacts c on c.id=m.contact_id where c.first_name='Gigi'")).rows).toHaveLength(0);
  });
  it("prenotazioni piattaforma: modificabili solo nel collegamento al contatto; manuali per intero", async () => {
    await addUser(db, "first@example.com");
    const staff = await addUser(db, "staff2@example.com");
    const marketing = await addUser(db, "mkt2@example.com");
    await db.query("update profiles set role='marketing' where id=$1", [marketing]);
    const c = (await db.query<{ id: string }>("insert into contacts (first_name) values ('Collegato') returning id")).rows[0].id;
    await asUser(db, staff, async () => {
      await db.query("update bookings set contact_id=$1, staff_notes='ok' where external_id='bkg_5'", [c]);
      await expect(db.query("update bookings set status='cancelled' where external_id='bkg_5'")).rejects.toThrow(/piattaforma/);
      await expect(db.query("update bookings set total_cents=1 where external_id='bkg_5'")).rejects.toThrow(/piattaforma/);
      const m = (await db.query<{ id: string }>("insert into bookings (source, external_id, starts_at, ends_at, status, total_cents) values ('manual','manual:1','2026-12-02T10:00:00Z','2026-12-02T11:00:00Z','confirmed',3000) returning id")).rows[0].id;
      await db.query("update bookings set status='cancelled', total_cents=2500 where id=$1", [m]);
      await expect(db.query("insert into bookings (source, external_id) values ('website','x')")).rejects.toThrow();
      await expect(db.query("delete from bookings where id=$1", [m])).resolves.toBeDefined();
    });
    await asUser(db, marketing, async () => {
      await expect(db.query("insert into bookings (source, external_id) values ('manual','manual:2')")).rejects.toThrow();
      await expect(db.query("select upsert_booking('{\"external_id\":\"Y\"}')")).rejects.toThrow();
    });
    expect((await db.query<{ contact_id: string }>("select contact_id from bookings where external_id='bkg_5'")).rows[0].contact_id).toBe(c);
  });
  it("dati non validi rifiutati dal database", async () => {
    await expect(up({ external_id: "B7", status: "boh" })).rejects.toThrow();
    await expect(up({ status: "confirmed" })).rejects.toThrow(/external_id/);
  });
});
