import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase/migrations");
const files = readdirSync(dir).sort().filter((f) => !f.includes("storage")); // lo schema storage è di Supabase
const apply = (db: PGlite, f: string) => db.exec(readFileSync(join(dir, f), "utf8"));

describe("migrazione pipeline unificata sui dati esistenti", () => {
  it("rimappa fasi e vecchia bacheca lead senza perdere schede né cronologia", async () => {
    const db = new PGlite();
    await db.exec(`create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; create role authenticated;`);
    const idx = files.indexOf("20261126000012_unified_pipeline.sql");
    for (const f of files.slice(0, idx)) await apply(db, f);

    const id = async (q: string) => (await db.query<{ id: string }>(q)).rows[0].id;
    const stage = (pipe: string, name: string) => id(`select s.id from pipeline_stages s join pipelines p on p.id=s.pipeline_id where p.kind='${pipe}' and s.name='${name}'`);
    const b2b = await id("select id from pipelines where kind='b2b'"), b2c = await id("select id from pipelines where kind='b2c'");
    const mk = async (first: string, lead: string | null) => id(`insert into contacts (first_name, lead_stage) values ('${first}', ${lead ? `'${lead}'` : "null"}) returning id`);
    const ca = await mk("Anna", "to_contact"), cb = await mk("Bruno", "visit_booked"), cc = await mk("Carla", "called"), cd = await mk("Dino", null);
    const oa = await id(`insert into opportunities (pipeline_id, stage_id, name, contact_id) values ('${b2b}', '${await stage("b2b", "Nuovo contatto")}', 'A', '${ca}') returning id`);
    const ob = await id(`insert into opportunities (pipeline_id, stage_id, name, contact_id) values ('${b2b}', '${await stage("b2b", "Trattativa")}', 'B', '${cb}') returning id`);
    const oc = await id(`insert into opportunities (pipeline_id, stage_id, name, contact_id, expected_value_cents) values ('${b2c}', '${await stage("b2c", "Prenotata")}', 'C', '${cd}', 5000) returning id`);
    const od = await id(`insert into opportunities (pipeline_id, stage_id, name, expected_value_cents) values ('${b2b}', '${await stage("b2b", "Acquisita")}', 'D', 9000) returning id`);
    const closedBefore = (await db.query<{ c: string }>(`select closed_at::text c from opportunities where id='${od}'`)).rows[0].c;

    await apply(db, files[idx]);

    const o = async (oid: string) => (await db.query<{ stage: string; kind: string; closed: string | null }>(
      `select s.name stage, o.kind, o.closed_at::text closed from opportunities o join pipeline_stages s on s.id=o.stage_id where o.id='${oid}'`)).rows[0];
    expect(await o(oa)).toMatchObject({ stage: "Da contattare", kind: "event" });
    expect(await o(ob)).toMatchObject({ stage: "Visita prenotata" });          // vince lead_stage
    expect(await o(oc)).toMatchObject({ stage: "Chiuso", kind: "individual" }); // ex B2C "Prenotata"
    expect(await o(od)).toMatchObject({ stage: "Chiuso", closed: closedBefore }); // chiusura originale conservata
    // Carla era un lead senza trattativa → ne ottiene una; Dino non era un lead e ha già la sua
    const carla = (await db.query<{ stage: string; kind: string }>(`select s.name stage, o.kind from opportunities o join pipeline_stages s on s.id=o.stage_id where o.contact_id='${cc}'`)).rows;
    expect(carla).toEqual([{ stage: "Chiamato", kind: "individual" }]);
    expect((await db.query("select 1 from opportunities")).rows).toHaveLength(5);
    expect((await db.query<{ n: number }>("select count(*)::int n from pipelines")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select count(*)::int n from pipeline_stages")).rows[0].n).toBe(8);
    // nessuna cronologia perde il riferimento alla fase
    expect((await db.query("select 1 from opportunity_stage_history where to_stage_id is null")).rows).toHaveLength(0);
    await expect(db.query("select lead_stage from contacts")).rejects.toThrow();
  });
});
