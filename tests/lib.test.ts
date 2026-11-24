import { describe, expect, it } from "vitest";
import { normalizePhone, normalizeEmail } from "@/lib/phone";
import { csvCell, toCsv } from "@/lib/csv";
import { classifyRows, guessMapping } from "@/lib/import";
import { can } from "@/lib/permissions";
import { formatDate, formatEuro } from "@/lib/format";
import { createDb } from "./db";

describe("telefono/email", () => {
  const cases = ["+39 333 111 2222", "0039 055 123456", "055 123456", "333-1112222", "", "3331112222", "39 055 1234567"];
  it("la normalizzazione TS coincide con quella SQL", async () => {
    const db = await createDb();
    for (const c of cases) {
      const r = await db.query<{ n: string | null }>("select normalize_phone($1) as n", [c]);
      expect(normalizePhone(c)).toBe(r.rows[0].n);
    }
  });
  it("prefisso +39 e formati diversi coincidono", () => {
    expect(normalizePhone("+39 333 1112222")).toBe(normalizePhone("333 111 2222"));
  });
  it("normalizza email", () => expect(normalizeEmail("  A@B.it ")).toBe("a@b.it"));
});

describe("CSV", () => {
  it("neutralizza formule e quota i separatori", () => {
    expect(csvCell("=CMD()")).toBe("'=CMD()");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv(["a"], [["+1"]])).toBe("a\r\n'+1");
  });
});

describe("import", () => {
  it("riconosce le intestazioni italiane e inglesi", () => {
    expect(guessMapping(["Nome", "Cognome", "E-mail", "Cellulare", "Altro"])).toEqual({
      Nome: "first_name", Cognome: "last_name", "E-mail": "email", Cellulare: "phone", Altro: "",
    });
  });
  it("classifica errori e duplicati senza fidarsi del solo nome", () => {
    const res = classifyRows(
      [
        { first_name: "Mario", last_name: "Rossi", email: "m@x.it" },
        { first_name: "Mario", last_name: "Rossi", email: "altro@x.it" }, // stesso nome, email diversa: non duplicato
        { first_name: "Dup", email: "M@x.it" },
        { first_name: "Tel", phone: "+39 333 1112222" },
        { first_name: "Tel2", phone: "333 111 2222" },
        { last_name: "", first_name: "" },
        { first_name: "Bad", email: "nope" },
        { first_name: "Esiste", email: "gia@x.it" },
      ],
      new Set(["gia@x.it"]),
      new Set(),
    );
    expect(res.map((r) => r.status)).toEqual(["ok", "ok", "duplicate", "ok", "duplicate", "error", "error", "duplicate"]);
  });
});

describe("permessi e formati", () => {
  it("applica la matrice", () => {
    expect(can("owner", "users.manage")).toBe(true);
    expect(can("admin", "users.manage")).toBe(false);
    expect(can("staff", "contacts.export")).toBe(false);
    expect(can("marketing", "consents.record")).toBe(true);
    expect(can("staff", "finance.view")).toBe(false);
    expect(can(null, "settings.view")).toBe(false);
    expect(can("admin", "payments.record")).toBe(true);
    expect(can("marketing", "payments.record")).toBe(false);
    expect(can("marketing", "marketing.spend")).toBe(true);
    expect(can("staff", "marketing.spend")).toBe(false);
    expect(can("staff", "config.manage")).toBe(false);
  });
  it("formatta in italiano", () => {
    expect(formatEuro(1234550).replace(/\s/g, " ")).toBe("12.345,50 €");
    expect(formatDate("2026-11-18T23:30:00Z")).toBe("19/11/2026"); // Europe/Rome
  });
});

import { startOfMonthRome } from "@/lib/format";
describe("inizio mese a Roma", () => {
  it("inverno (CET): 1 dicembre 00:00 Roma = 30 nov 23:00 UTC", () => {
    expect(startOfMonthRome(new Date("2026-12-15T12:00:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
  it("estate (CEST): 1 luglio 00:00 Roma = 30 giu 22:00 UTC", () => {
    expect(startOfMonthRome(new Date("2026-07-15T12:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
  it("a cavallo del mese usa il mese di Roma", () => {
    // 30 nov 23:30 UTC è già il 1 dicembre a Roma
    expect(startOfMonthRome(new Date("2026-11-30T23:30:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
});
