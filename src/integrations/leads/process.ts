import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const PROVIDER = "meta_leads";
type Status = "processed" | "ignored" | "unmapped" | "failed";

const answer = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).nullish();
const schema = z.object({
  data: z.record(z.string(), answer),
  leadgenId: z.union([z.string(), z.number()]).transform(String),
  formId: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  pageId: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  isOrganic: z.boolean().nullish(),
  dateCreated: z.string().nullish(),
});

export type MappedLead = {
  lead_id: string; form_id: string | null; page_id: string | null; is_organic: boolean;
  name: string | null; email: string | null; phone: string | null; company: string | null;
  event_type: string | null; attendees: number | null; note: string;
};
export type LeadMap = { ok: true; kind: "test" } | { ok: true; kind: "lead"; lead: MappedLead } | { ok: false; reason: string };

const flat = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v)).trim();
const isDummy = (s: string) => /^<test lead/i.test(s);
/** "nome_azienda" → "Nome azienda"; la domanda resta leggibile nella nota. */
const label = (k: string) => { const s = k.replace(/_/g, " ").trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
/** Campo con nome esatto (es. "nome" non deve confondersi con "nome_azienda"). */
const exact = (d: Record<string, string>, ...names: string[]) => {
  const key = Object.keys(d).find((k) => names.includes(k.toLowerCase()));
  return key ? d[key] || null : null;
};
const pick = (d: Record<string, string>, ...prefixes: string[]) => {
  const key = Object.keys(d).find((k) => prefixes.some((p) => k.toLowerCase().startsWith(p)));
  return key ? d[key] || null : null;
};

/** Interpreta il lead inviato da Make: campi riconosciuti per nome (it/en), tutte le risposte finiscono nella nota. */
export function mapLead(raw: unknown): LeadMap {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join(".") || "lead"}: ${i.message}`).join("; ").slice(0, 500) };
  const d = Object.fromEntries(Object.entries(parsed.data.data).map(([k, v]) => [k, flat(v)] as [string, string]).filter(([, v]) => v));
  const values: string[] = Object.values(d);
  // Lead di prova generato da Meta ("Strumento di test dei lead"): dati fittizi, nessun contatto creato.
  if (values.some(isDummy) || d["e-mail"] === "test@meta.com") return { ok: true, kind: "test" };

  const email = pick(d, "e-mail", "email", "e_mail")?.toLowerCase() ?? null;
  const attendeesText = pick(d, "quante", "partecipanti", "persone");
  const attendees = attendeesText && /^\d{1,5}$/.test(attendeesText) ? Number(attendeesText) : null;
  const note = ["Lead da modulo Facebook/Instagram", ...Object.entries(d).map(([k, v]) => `${label(k)}: ${v}`)].join("\n");
  return {
    ok: true, kind: "lead",
    lead: {
      lead_id: parsed.data.leadgenId, form_id: parsed.data.formId, page_id: parsed.data.pageId, is_organic: parsed.data.isOrganic === true,
      name: exact(d, "nome_e_cognome", "nome e cognome", "full_name", "full name", "name", "nome", "nome_cognome"), email, phone: pick(d, "numero_di_telefono", "telefono", "phone"),
      company: pick(d, "nome_azienda", "azienda", "company"), event_type: pick(d, "che_tipo_di_evento", "tipo_di_evento", "evento"), attendees, note,
    },
  };
}

export async function processLeadEvent(admin: SupabaseClient, ev: { id: string; payload: unknown; attempts: number }): Promise<{ status: Status; error?: string }> {
  const finish = async (status: Status, last_error: string | null = null) =>
    admin.from("webhook_events").update({ status, last_error, attempts: ev.attempts + 1, processed_at: new Date().toISOString() }).eq("id", ev.id);
  const m = mapLead(ev.payload);
  if (!m.ok) { await finish("unmapped", m.reason); return { status: "unmapped", error: m.reason }; }
  if (m.kind === "test") { await finish("ignored"); return { status: "ignored" }; }
  const { error } = await admin.rpc("upsert_lead", { p: m.lead });
  if (error) { await finish("failed", error.message.slice(0, 500)); return { status: "failed", error: error.message }; }
  await finish("processed");
  return { status: "processed" };
}
