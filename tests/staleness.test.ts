import { describe, expect, it } from "vitest";
import { staleness } from "@/lib/staleness";
import { buildThread } from "@/lib/thread";

const now = new Date("2026-11-26T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

describe("scheda ferma", () => {
  it("nessun colore entro 72 ore, giallo da 72 ore", () => {
    expect(staleness(ago(10), now)).toBeNull();
    expect(staleness(ago(71), now)).toBeNull();
    expect(staleness(ago(72), now)).toBe("warn");
    expect(staleness(ago(120), now)).toBe("warn");
  });
  it("rosso dopo 7 giorni di calendario (a Roma), non 168 ore esatte", () => {
    expect(staleness("2026-11-19T22:30:00Z", now)).toBe("late"); // 19/11 23:30 a Roma → 7 giorni di calendario fa
    expect(staleness("2026-11-20T10:00:00Z", now)).toBe("warn");
    expect(staleness(ago(24 * 9), now)).toBe("late");
  });
  it("senza data non colora", () => expect(staleness(null, now)).toBeNull());
});

describe("cronologia unica", () => {
  it("unisce note, pagamenti e aggiornamenti dal più recente, senza duplicare note e pagamenti", () => {
    const items = buildThread({
      notes: [{ id: "1", body: "Chiamato", author_id: "u", created_at: "2026-11-25T10:00:00Z" }],
      payments: [{ id: "2", kind: "payment", amount_cents: 5000, method: "cash", paid_at: "2026-11-26T09:00:00Z", reference: null }],
      activities: [
        { id: "3", type: "stage", summary: "Fase: A → B", created_at: "2026-11-24T10:00:00Z", actor_id: null },
        { id: "4", type: "note", summary: "Nota aggiunta", created_at: "2026-11-25T10:00:00Z", actor_id: "u" },
        { id: "5", type: "payment", summary: "Pagamento registrato", created_at: "2026-11-26T09:00:00Z", actor_id: "u" },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(["payment", "note", "event"]);
  });
});
