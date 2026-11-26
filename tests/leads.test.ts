import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { mapLead } from "@/integrations/leads/process";
import { createDb } from "./db";

const TEST_LEAD = {
  data: { "e-mail": "test@meta.com", nome_azienda: "<test lead: dummy data for nome_azienda>", nome_e_cognome: "<test lead: dummy data for nome_e_cognome>",
    numero_di_telefono: "<test lead: dummy data for numero_di_telefono>", "che_tipo_di_evento_stai_valutando?": ["<test lead: dummy data for che_tipo_di_evento_stai_valutando?>"] },
  formId: "2483879385479449", pageId: "1027542477104522", isOrganic: true, leadgenId: "1501799308528956", dateCreated: "2026-11-25T15:50:02.000Z",
};
const REAL = {
  data: { "e-mail": "Anna.Verdi@Azienda.it", nome_azienda: "Azienda Srl", nome_e_cognome: "Anna Verdi", numero_di_telefono: "+39 055 111 2222",
    "che_tipo_di_evento_stai_valutando?": ["Team building"], "quando_vorresti_organizzare_l'evento?": ["Entro 3 mesi"], "quante_persone_parteciperanno_indicativamente?": ["25"] },
  formId: "2483879385479449", pageId: "1027542477104522", isOrganic: false, leadgenId: 777, dateCreated: "2026-11-25T16:00:00.000Z",
};

describe("lead Meta (mapper)", () => {
  it("riconosce il lead di prova di Meta", () => {
    expect(mapLead(TEST_LEAD)).toEqual({ ok: true, kind: "test" });
  });
  it("estrae contatto, azienda, evento e partecipanti; tutte le risposte vanno nella nota", () => {
    const m = mapLead(REAL);
    if (!m.ok || m.kind !== "lead") throw new Error("mapper");
    expect(m.lead).toMatchObject({ lead_id: "777", name: "Anna Verdi", email: "anna.verdi@azienda.it", company: "Azienda Srl", event_type: "Team building", attendees: 25, is_organic: false });
    expect(m.lead.note).toContain("Entro 3 mesi");
  });
  it("payload non valido → errore, non eccezione", () => {
    expect(mapLead({ nope: 1 }).ok).toBe(false);
  });
});

describe("upsert_lead (SQL)", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDb(); });
  const up = async (p: object) => (await db.query<{ id: string }>("select upsert_lead($1::jsonb) as id", [JSON.stringify(p)])).rows[0].id;
  const lead = () => { const m = mapLead(REAL); if (!m.ok || m.kind !== "lead") throw new Error("mapper"); return m.lead; };

  it("crea contatto, azienda, nota e scheda evento in Da contattare", async () => {
    const opp = await up(lead());
    const o = (await db.query<{ name: string; event_type: string; attendees: number; source: string; kind: string; stage: string; contact_id: string; company_id: string }>(
      "select o.name,o.event_type,o.attendees,o.source,o.kind,s.name as stage,o.contact_id,o.company_id from opportunities o join pipeline_stages s on s.id=o.stage_id where o.id=$1", [opp])).rows[0];
    expect(o).toMatchObject({ name: "Azienda Srl — Team building", event_type: "Team building", attendees: 25, source: "meta_ads", kind: "event", stage: "Da contattare" });
    const c = (await db.query<{ kind: string; source: string; attribution_status: string; last_name: string }>("select kind,source,attribution_status,last_name from contacts where id=$1", [o.contact_id])).rows[0];
    expect(c).toEqual({ kind: "b2b", source: "meta_ads", attribution_status: "marketing", last_name: "Verdi" });
    expect((await db.query("select 1 from company_contacts where company_id=$1 and contact_id=$2", [o.company_id, o.contact_id])).rows).toHaveLength(1);
    expect((await db.query("select 1 from notes where contact_id=$1 and body like '%Entro 3 mesi%'", [o.contact_id])).rows).toHaveLength(1);
  });
  it("stesso contatto (email) e stessa azienda: nessun duplicato, nuova trattativa", async () => {
    await up({ ...lead(), lead_id: "778", email: "ANNA.VERDI@azienda.it", company: "azienda srl" });
    expect((await db.query<{ n: number }>("select count(*)::int n from contacts where email_norm='anna.verdi@azienda.it'")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select count(*)::int n from companies where lower(name)='azienda srl'")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select count(*)::int n from opportunities")).rows[0].n).toBe(2);
  });
  it("lead organico: origine organica, attribuzione non assegnata a marketing", async () => {
    await up({ ...lead(), lead_id: "779", email: "org@x.it", name: "Org Anico", phone: null, company: null, is_organic: true });
    const c = (await db.query<{ source: string; attribution_status: string; kind: string }>("select source,attribution_status,kind from contacts where email_norm='org@x.it'")).rows[0];
    expect(c).toEqual({ source: "facebook_organic", attribution_status: "unknown", kind: "b2c" });
  });
  it("senza nome, email né telefono: errore", async () => {
    await expect(db.query("select upsert_lead('{\"lead_id\":\"1\"}')")).rejects.toThrow(/lead senza/);
  });
});
