import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb } from "./db";

let db: PGlite;
let admin: string, marketing: string, staff: string;

async function setRole(id: string, role: string) {
  await db.query("update profiles set role = $2 where id = $1", [id, role]);
}

beforeAll(async () => {
  db = await createDb();
  await addUser(db, "owner@example.com");
  admin = await addUser(db, "admin@example.com");
  marketing = await addUser(db, "mkt@example.com");
  staff = await addUser(db, "staff@example.com");
  await setRole(admin, "admin");
  await setRole(marketing, "marketing");
});

describe("ruoli", () => {
  it("il primo utente è owner, gli altri staff", async () => {
    const r = await db.query<{ email: string; role: string }>("select email, role from profiles order by email");
    const m = Object.fromEntries(r.rows.map((x) => [x.email, x.role]));
    expect(m["owner@example.com"]).toBe("owner");
    expect(m["staff@example.com"]).toBe("staff");
  });
  it("un utente non autenticato non vede nulla", async () => {
    await db.exec("set role authenticated");
    const r = await db.query("select * from contacts");
    await db.exec("reset role");
    expect(r.rows).toHaveLength(0);
  });
});

describe("contatti e RLS", () => {
  let contactId: string;
  it("staff può creare e leggere un contatto", async () => {
    await asUser(db, staff, async () => {
      const r = await db.query<{ id: string; display_name: string; phone_norm: string }>(
        "insert into contacts (first_name,last_name,email,phone) values ('Anna','Test','ANNA@Example.com ','+39 333 111 2222') returning id, display_name, phone_norm",
      );
      contactId = r.rows[0].id;
      expect(r.rows[0].display_name).toBe("Anna Test");
      expect(r.rows[0].phone_norm).toBe("3331112222");
    });
  });
  it("normalizza l'email per il confronto", async () => {
    const r = await db.query<{ email_norm: string }>("select email_norm from contacts where id=$1", [contactId]);
    expect(r.rows[0].email_norm).toBe("anna@example.com");
  });
  it("rifiuta contatti senza nome", async () => {
    await expect(db.query("insert into contacts (email) values ('x@y.it')")).rejects.toThrow();
  });
  it("staff e marketing non possono archiviare", async () => {
    for (const u of [staff, marketing]) {
      await asUser(db, u, async () => {
        await expect(db.query("update contacts set archived_at = now() where id=$1", [contactId])).rejects.toThrow(/owner e admin/);
      });
    }
  });
  it("staff non può eliminare, admin sì", async () => {
    const tmp = await db.query<{ id: string }>("insert into contacts (first_name) values ('Temp') returning id");
    const id = tmp.rows[0].id;
    await asUser(db, staff, async () => {
      await db.query("delete from contacts where id=$1", [id]);
    });
    expect((await db.query("select 1 from contacts where id=$1", [id])).rows).toHaveLength(1);
    await asUser(db, admin, async () => {
      await db.query("delete from contacts where id=$1", [id]);
    });
    expect((await db.query("select 1 from contacts where id=$1", [id])).rows).toHaveLength(0);
  });
});

describe("accesso riservato", () => {
  it("staff non legge l'audit log, admin sì", async () => {
    await asUser(db, staff, async () => {
      expect((await db.query("select * from audit_logs")).rows).toHaveLength(0);
    });
    await asUser(db, admin, async () => {
      expect((await db.query("select * from audit_logs")).rows.length).toBeGreaterThan(0);
    });
  });
  it("solo owner modifica ruoli", async () => {
    await asUser(db, admin, async () => {
      await db.query("update profiles set role='owner' where id=$1", [staff]);
    });
    expect((await db.query<{ role: string }>("select role from profiles where id=$1", [staff])).rows[0].role).toBe("staff");
  });
  it("solo owner modifica le impostazioni", async () => {
    await asUser(db, admin, async () => {
      await db.query("update organization_settings set name='X'");
    });
    expect((await db.query<{ name: string }>("select name from organization_settings")).rows[0].name).toBe("TechnoSim25");
  });
  it("consensi: staff non può registrare, marketing sì", async () => {
    const c = (await db.query<{ id: string }>("insert into contacts (first_name) values ('Consenso') returning id")).rows[0].id;
    await asUser(db, staff, async () => {
      await expect(
        db.query("insert into marketing_consents (contact_id,channel,status) values ($1,'email','granted')", [c]),
      ).rejects.toThrow();
    });
    await asUser(db, marketing, async () => {
      await db.query("insert into marketing_consents (contact_id,channel,status,evidence) values ($1,'email','granted','modulo sito')", [c]);
    });
  });
  it("le note possono essere modificate solo dall'autore (o admin)", async () => {
    const c = (await db.query<{ id: string }>("insert into contacts (first_name) values ('Note') returning id")).rows[0].id;
    let noteId = "";
    await asUser(db, staff, async () => {
      noteId = (await db.query<{ id: string }>("insert into notes (contact_id, body, author_id) values ($1,'ciao',$2) returning id", [c, staff])).rows[0].id;
    });
    await asUser(db, marketing, async () => {
      await db.query("update notes set body='hack' where id=$1", [noteId]);
    });
    expect((await db.query<{ body: string }>("select body from notes where id=$1", [noteId])).rows[0].body).toBe("ciao");
  });
});

describe("unione contatti", () => {
  it("sposta dati collegati e archivia il duplicato; staff non può", async () => {
    const a = (await db.query<{ id: string }>("insert into contacts (first_name,email) values ('Keep','k@x.it') returning id")).rows[0].id;
    const b = (await db.query<{ id: string }>("insert into contacts (first_name,phone,city,do_not_contact) values ('Drop','333 999 8888','Pisa',true) returning id")).rows[0].id;
    await db.query("insert into notes (contact_id, body) values ($1,'nota del duplicato')", [b]);
    await asUser(db, staff, async () => {
      await expect(db.query("select merge_contacts($1,$2)", [a, b])).rejects.toThrow();
    });
    await asUser(db, admin, async () => {
      await db.query("select merge_contacts($1,$2)", [a, b]);
    });
    const k = (await db.query<{ phone: string; city: string; do_not_contact: boolean }>("select phone, city, do_not_contact from contacts where id=$1", [a])).rows[0];
    expect(k).toEqual({ phone: "333 999 8888", city: "Pisa", do_not_contact: true });
    expect((await db.query("select 1 from notes where contact_id=$1", [a])).rows).toHaveLength(1);
    const d = (await db.query<{ merged_into: string; archived_at: string | null }>("select merged_into, archived_at from contacts where id=$1", [b])).rows[0];
    expect(d.merged_into).toBe(a);
    expect(d.archived_at).not.toBeNull();
  });
});
