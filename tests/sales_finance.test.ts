import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb } from "./db";

let db: PGlite;
let admin: string, marketing: string, staff: string;
let b2b: { pipeline: string; stages: Record<string, string> };

async function stages(kind: string) {
  const p = (await db.query<{ id: string }>("select id from pipelines where kind=$1", [kind])).rows[0].id;
  const s = (await db.query<{ id: string; name: string }>("select id,name from pipeline_stages where pipeline_id=$1", [p])).rows;
  return { pipeline: p, stages: Object.fromEntries(s.map((x) => [x.name, x.id])) };
}

beforeAll(async () => {
  db = await createDb();
  await addUser(db, "o@example.com");
  admin = await addUser(db, "a@example.com");
  marketing = await addUser(db, "m@example.com");
  staff = await addUser(db, "s@example.com");
  await db.query("update profiles set role='admin' where id=$1", [admin]);
  await db.query("update profiles set role='marketing' where id=$1", [marketing]);
  b2b = await stages("sales");
});

describe("pipeline di default", () => {
  it("due pipeline (Eventi e Individui) con le stesse 11 fasi in italiano: una chiusa (acquisita) e una persa", async () => {
    expect((await db.query<{ n: number }>("select count(*)::int n from pipelines")).rows[0].n).toBe(2);
    const names = async (k: string) => (await db.query<{ name: string }>("select s.name from pipeline_stages s join pipelines p on p.id=s.pipeline_id where p.kind=$1 order by s.position", [k])).rows.map((r) => r.name);
    expect(await names("individuals")).toEqual(await names("sales"));
    expect(Object.keys(b2b.stages)).toHaveLength(11);
    const kinds = (await db.query<{ kind: string }>("select kind from pipeline_stages where pipeline_id=$1 and kind<>'open'", [b2b.pipeline])).rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(["lost", "won"]);
    expect(b2b.stages["Prenotato"]).toBeDefined();
    expect(b2b.stages["Da contattare"]).toBeDefined();
    const order = (await db.query<{ name: string }>("select name from pipeline_stages where pipeline_id=$1 order by position", [b2b.pipeline])).rows.map((r) => r.name);
    expect(order).toEqual(["Da contattare", "Chiamato", "Da richiamare", "Messaggio inviato", "Follow-up", "Trattativa in corso", "Visita prenotata", "Invia preventivo", "Preventivo inviato", "Prenotato", "Non interessato"]);
  });
});

describe("opportunità", () => {
  let oppId: string;
  it("crea, registra la fase iniziale e ogni passaggio con utente", async () => {
    await asUser(db, staff, async () => {
      oppId = (await db.query<{ id: string }>(
        "insert into opportunities (pipeline_id, stage_id, name, expected_value_cents) values ($1,$2,'Evento Demo',100000) returning id",
        [b2b.pipeline, b2b.stages["Da contattare"]])).rows[0].id;
      await db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2b.stages["Chiamato"]]);
    });
    const h = (await db.query<{ changed_by: string; from_stage_id: string | null }>("select changed_by, from_stage_id from opportunity_stage_history where opportunity_id=$1 order by changed_at, id", [oppId])).rows;
    expect(h).toHaveLength(2);
    expect(h[0].from_stage_id).toBeNull();
    expect(h[1].changed_by).toBe(staff);
  });
  it("acquisita: chiude, valore concordato = atteso, ma NON risulta pagata", async () => {
    await asUser(db, staff, async () => {
      await db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2b.stages["Prenotato"]]);
    });
    const o = (await db.query<{ closed_at: string | null; agreed_value_cents: number }>("select closed_at, agreed_value_cents from opportunities where id=$1", [oppId])).rows[0];
    expect(o.closed_at).not.toBeNull();
    expect(o.agreed_value_cents).toBe(100000);
    expect((await db.query("select 1 from payments where opportunity_id=$1", [oppId])).rows).toHaveLength(0);
  });
  it("riaprire azzera chiusura; persa conserva il motivo", async () => {
    await db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2b.stages["Follow-up"]]);
    expect((await db.query<{ closed_at: string | null }>("select closed_at from opportunities where id=$1", [oppId])).rows[0].closed_at).toBeNull();
    await db.query("update opportunities set stage_id=$2, lost_reason='Prezzo' where id=$1", [oppId, b2b.stages["Non interessato"]]);
    expect((await db.query<{ lost_reason: string }>("select lost_reason from opportunities where id=$1", [oppId])).rows[0].lost_reason).toBe("Prezzo");
  });
  it("rifiuta una fase di un'altra pipeline", async () => {
    const other = (await db.query<{ id: string }>("insert into pipelines (name, kind) values ('Altra', 'b2c') returning id")).rows[0].id;
    const foreign = (await db.query<{ id: string }>("insert into pipeline_stages (pipeline_id, name, position) values ($1,'X',1) returning id", [other])).rows[0].id;
    await expect(db.query("update opportunities set stage_id=$2 where id=$1", [oppId, foreign])).rejects.toThrow(/pipeline/);
    await db.query("delete from pipelines where id=$1", [other]);
  });
  it("note e task collegabili alla trattativa", async () => {
    await db.query("insert into notes (opportunity_id, body) values ($1,'ok')", [oppId]);
    await db.query("insert into tasks (title, opportunity_id) values ('Chiamare', $1)", [oppId]);
    await expect(db.query("insert into notes (body) values ('orfana')")).rejects.toThrow();
  });
});

describe("pagamenti e rimborsi", () => {
  let payId: string;
  it("solo owner/admin leggono e registrano pagamenti", async () => {
    await asUser(db, admin, async () => {
      payId = (await db.query<{ id: string }>("insert into payments (amount_cents, method, recorded_by) values (30000,'cash',$1) returning id", [admin])).rows[0].id;
    });
    for (const u of [staff, marketing]) {
      await asUser(db, u, async () => {
        expect((await db.query("select * from payments")).rows).toHaveLength(0);
        await expect(db.query("insert into payments (amount_cents, method, recorded_by) values (100,'cash',$1)", [u])).rejects.toThrow();
      });
    }
  });
  it("il rimborso non può superare l'incassato (neppure sommando più rimborsi)", async () => {
    await asUser(db, admin, async () => {
      await db.query("insert into payments (kind, refund_of, amount_cents, method, recorded_by) values ('refund',$1,10000,'cash',$2)", [payId, admin]);
      await expect(db.query("insert into payments (kind, refund_of, amount_cents, method, recorded_by) values ('refund',$1,20001,'cash',$2)", [payId, admin])).rejects.toThrow(/supera/);
      await db.query("insert into payments (kind, refund_of, amount_cents, method, recorded_by) values ('refund',$1,20000,'cash',$2)", [payId, admin]);
    });
  });
  it("un rimborso deve riferirsi a un pagamento; il registro non si cancella", async () => {
    await expect(db.query("insert into payments (kind, amount_cents, method) values ('refund',100,'cash')")).rejects.toThrow();
    await asUser(db, admin, async () => {
      await expect(db.query("delete from payments where id=$1", [payId])).rejects.toThrow(/permission denied/);
    });
    expect((await db.query("select 1 from payments where id=$1", [payId])).rows).toHaveLength(1);
  });
  it("lo stesso ID esterno non si registra due volte", async () => {
    await db.query("insert into payments (amount_cents, method, source, external_id) values (100,'stripe','stripe','pi_1')");
    await expect(db.query("insert into payments (amount_cents, method, source, external_id) values (100,'stripe','stripe','pi_1')")).rejects.toThrow();
  });
});

describe("incassato per origine (aggregati)", () => {
  it("netto IVA e rimborsi; marketing vede gli aggregati ma non i pagamenti; staff no", async () => {
    const c = (await db.query<{ id: string }>("insert into contacts (first_name, source) values ('Cliente','meta_ads') returning id")).rows[0].id;
    await db.query("insert into payments (contact_id, amount_cents, vat_rate, method, paid_at) values ($1,12200,22,'cash','2026-11-10T10:00:00Z')", [c]);
    const p2 = (await db.query<{ id: string }>("insert into payments (contact_id, amount_cents, vat_rate, method, paid_at) values ($1,6100,22,'cash','2026-11-11T10:00:00Z') returning id", [c])).rows[0].id;
    await db.query("insert into payments (kind, refund_of, contact_id, amount_cents, vat_rate, method, paid_at) values ('refund',$1,$2,6100,22,'cash','2026-11-12T10:00:00Z')", [p2, c]);
    await asUser(db, marketing, async () => {
      const r = (await db.query<{ source: string; customers: string; collected_net_cents: string }>(
        "select * from revenue_by_source('2026-11-01','2026-12-01') where source='meta_ads'")).rows[0];
      expect(Number(r.collected_net_cents)).toBe(10000); // 12200/1.22 = 10000; 6100 incassati e rimborsati si annullano
      expect(Number(r.customers)).toBe(1);
      expect((await db.query("select * from payments")).rows).toHaveLength(0);
    });
    await asUser(db, staff, async () => {
      await expect(db.query("select * from revenue_by_source('2026-11-01','2026-12-01')")).rejects.toThrow();
    });
  });
});

describe("spese e marketing", () => {
  it("staff non accede alle spese; marketing gestisce la spesa pubblicitaria", async () => {
    await db.query("insert into expenses (net_cents, vat_cents) values (1000, 220)");
    expect((await db.query<{ total_cents: number }>("select total_cents from expenses")).rows[0].total_cents).toBe(1220);
    await asUser(db, staff, async () => { expect((await db.query("select * from expenses")).rows).toHaveLength(0); });
    await asUser(db, marketing, async () => {
      expect((await db.query("select * from expenses")).rows).toHaveLength(0);
      await db.query("insert into marketing_spend (platform, period_start, period_end, amount_cents) values ('meta','2026-11-01','2026-11-30',50000)");
      await expect(db.query("insert into marketing_spend (platform, period_start, period_end, amount_cents) values ('meta','2026-11-30','2026-11-01',1)")).rejects.toThrow();
    });
    await asUser(db, staff, async () => {
      await expect(db.query("insert into marketing_spend (platform, period_start, period_end, amount_cents) values ('meta','2026-11-01','2026-11-02',1)")).rejects.toThrow();
    });
  });
  it("solo owner/admin configurano pipeline e servizi", async () => {
    await asUser(db, staff, async () => {
      await expect(db.query("insert into services (name) values ('X')")).rejects.toThrow();
      await db.query("update pipeline_stages set name='Hack'");
    });
    expect((await db.query("select 1 from pipeline_stages where name='Hack'")).rows).toHaveLength(0);
    await asUser(db, admin, async () => { await db.query("insert into services (name, default_price_cents) values ('Sessione 60 min', 3490)"); });
  });
});

describe("IVA sui pagamenti", () => {
  it("l'aliquota si conserva con quattro decimali e il netto torna esatto", async () => {
    await db.query("insert into payments (kind, amount_cents, vat_rate, method) values ('payment', 112345, 12.3450, 'cash')");
    const r = (await db.query<{ vat_rate: string; net: number }>("select vat_rate::text, round(amount_cents / (1 + vat_rate / 100))::int as net from payments where amount_cents=112345")).rows[0];
    expect(Number(r.vat_rate)).toBeCloseTo(12.345, 4);
    expect(r.net).toBe(100000);
  });
});

describe("prenotazioni → schede evento", () => {
  const booking = (ext: string, extra: object = {}) => db.query<{ id: string }>("select upsert_booking($1::jsonb) as id",
    [JSON.stringify({ external_id: ext, customer_name: "Mario", customer_surname: "Rossi", customer_email: `${ext}@x.it`, service_name: "Sessione F1", total_cents: 6000, paid_cents: 6000, starts_at: "2026-12-01T10:00:00Z", ...extra })]).then((r) => r.rows[0].id);
  const opp = async (bid: string) => (await db.query<{ kind: string; stage: string; value: number; contact_id: string | null }>(
    "select o.kind, s.name as stage, o.agreed_value_cents as value, o.contact_id from opportunities o join pipeline_stages s on s.id=o.stage_id where o.booking_id=$1", [bid])).rows;

  it("ogni prenotazione crea una scheda Individuale già Prenotato con il valore", async () => {
    const b = await booking("bk1");
    const rows = await opp(b);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "individual", stage: "Prenotato", value: 6000 });
    expect(rows[0].contact_id).not.toBeNull();
  });
  it("un aggiornamento non duplica la scheda; l'annullamento la porta in Non interessato", async () => {
    const b = await booking("bk2");
    await booking("bk2", { total_cents: 8000 });
    expect(await opp(b)).toMatchObject([{ stage: "Prenotato", value: 8000 }]);
    await booking("bk2", { status: "cancelled" });
    expect(await opp(b)).toMatchObject([{ stage: "Non interessato" }]);
  });
  it("le prenotazioni di prova non creano schede", async () => {
    const b = await booking("bk3", { is_test: true });
    expect(await opp(b)).toHaveLength(0);
  });
  it("i pagamenti della prenotazione compaiono sulla scheda", async () => {
    const b = await booking("bk4");
    const o = (await db.query<{ id: string }>("select id from opportunities where booking_id=$1", [b])).rows[0].id;
    await db.query("insert into payments (kind, booking_id, amount_cents, method) values ('payment', $1, 1000, 'cash')", [b]);
    expect((await db.query<{ opportunity_id: string }>("select opportunity_id from payments where booking_id=$1", [b])).rows[0].opportunity_id).toBe(o);
  });
});
