/** Tipo di scheda → tipo di pipeline nel database ("sales" = Eventi, "individuals" = Individuali). */
export type OppKind = "event" | "individual";
export const PIPELINE_KIND: Record<OppKind, "sales" | "individuals"> = { event: "sales", individual: "individuals" };
export const parseKind = (v: unknown): OppKind => (v === "individual" ? "individual" : "event");
