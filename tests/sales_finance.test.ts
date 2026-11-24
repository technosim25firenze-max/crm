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
  b2b = await stages("b2b");
});

describe("pipeline di default", () => {
  it("B2B ha 12 fasi in italiano con una acquisita e una persa", async () => {
    expect(Object.keys(b2b.stages)).toHaveLength(12);
    const kinds = (await db.query<{ kind: string }>("select kind from pipeline_stages where pipeline_id=$1 and kind<>'open'", [b2b.pipeline])).rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(["lost", "won"]);
    expect(b2b.stages["Acquisita"]).toBeDefined();
  });
});

describe("opportunità", () => {
  let oppId: string;
  it("crea, registra la fase iniziale e ogni passaggio con utente", async () => {
    await asUser(db, staff, async () => {
      oppId = (await db.query<{ id: string }>(
        "insert into opportunities (pipeline_id, stage_id, name, expected_value_cents) values ($1,$2,'Evento Demo',100000) returning id",
        [b2b.pipeline, b2b.stages["Nuovo contatto"]])).rows[0].id;
      await db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2b.stages["Contattato"]]);
    });
    const h = (await db.query<{ changed_by: string; from_stage_id: string | null }>("select changed_by, from_stage_id from opportunity_stage_history where opportunity_id=$1 order by changed_at, id", [oppId])).rows;
    expect(h).toHaveLength(2);
    expect(h[0].from_stage_id).toBeNull();
    expect(h[1].changed_by).toBe(staff);
  });
  it("acquisita: chiude, valore concordato = atteso, ma NON risulta pagata", async () => {
    await asUser(db, staff, async () => {
      await db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2b.stages["Acquisita"]]);
    });
    const o = (await db.query<{ closed_at: string | null; agreed_value_cents: number }>("select closed_at, agreed_value_cents from opportunities where id=$1", [oppId])).rows[0];
    expect(o.closed_at).not.toBeNull();
    expect(o.agreed_value_cents).toBe(100000);
    expect((await db.query("select 1 from payments where opportunity_id=$1", [oppId])).rows).toHaveLength(0);
  });
  it("riaprire azzera chiusura; persa conserva il motivo", async () => {
    await db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2b.stages["Trattativa"]]);
    expect((await db.query<{ closed_at: string | null }>("select closed_at from opportunities where id=$1", [oppId])).rows[0].closed_at).toBeNull();
    await db.query("update opportunities set stage_id=$2, lost_reason='Prezzo' where id=$1", [oppId, b2b.stages["Persa"]]);
    expect((await db.query<{ lost_reason: string }>("select lost_reason from opportunities where id=$1", [oppId])).rows[0].lost_reason).toBe("Prezzo");
  });
  it("rifiuta una fase di un'altra pipeline", async () => {
    const b2c = await stages("b2c");
    await expect(db.query("update opportunities set stage_id=$2 where id=$1", [oppId, b2c.stages["Nuova richiesta"]])).rejects.toThrow(/pipeline/);
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
    const c = (await db.query<{ id: string }>("insert into contacts (first_name, source) values ('Cliente','meta_lead_ads') returning id")).rows[0].id;
    await db.query("insert into payments (contact_id, amount_cents, vat_rate, method, paid_at) values ($1,12200,22,'cash','2026-11-10T10:00:00Z')", [c]);
    const p2 = (await db.query<{ id: string }>("insert into payments (contact_id, amount_cents, vat_rate, method, paid_at) values ($1,6100,22,'cash','2026-11-11T10:00:00Z') returning id", [c])).rows[0].id;
    await db.query("insert into payments (kind, refund_of, contact_id, amount_cents, vat_rate, method, paid_at) values ('refund',$1,$2,6100,22,'cash','2026-11-12T10:00:00Z')", [p2, c]);
    await asUser(db, marketing, async () => {
      const r = (await db.query<{ source: string; customers: string; collected_net_cents: string }>(
        "select * from revenue_by_source('2026-11-01','2026-12-01') where source='meta_lead_ads'")).rows[0];
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
