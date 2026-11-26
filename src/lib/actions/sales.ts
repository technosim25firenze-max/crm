"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cleanSearch } from "@/lib/search";
import { normalizePhone } from "@/lib/phone";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";
import { romeLocalToUtc } from "@/lib/format";
import { dateField, euroField, grossCents, intField, uuid, vatRateOf } from "./fields";
import { autoVatCents, DEFAULT_VAT_RATE } from "@/lib/money";
import { resolveContact } from "./contact-link";
import { resolveCompany } from "./company-link";
import { PIPELINE_KIND, parseKind, type OppKind } from "@/lib/pipelines";
import { errorState, logActivity, parseForm, type ActionState } from "./shared";

const text = (n = 200) => z.string().max(n, t.validation.tooLong).optional();

const METHODS = ["cash", "card_pos", "bank_transfer", "gift_card", "other"] as const;

const oppSchema = z.object({
  name: z.string().min(1, t.validation.required).max(200, t.validation.tooLong),
  contact_id: uuid, company_id: uuid,
  expected_value: euroField, expected_value_vat: euroField, attendees: intField(1, 100000),
  event_date: dateField, event_type: text(100),
  owner_id: uuid, stage_id: uuid, kind: z.enum(["event", "individual"]).default("event"),
});

function toRow(d: z.output<typeof oppSchema>) {
  return {
    name: d.name, kind: d.kind, contact_id: d.contact_id ?? null, company_id: d.company_id ?? null,
    expected_value_cents: grossCents(d.expected_value, d.expected_value_vat) ?? null,
    vat_cents: d.expected_value === undefined ? null : d.expected_value_vat ?? 0, attendees: d.attendees ?? null,
    event_date: d.event_date ?? null, event_type: d.event_type ?? null,
  };
}

export async function createOpportunity(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(oppSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const contact = await resolveContact(supabase, fd);
  if (contact.fieldErrors) return { fieldErrors: contact.fieldErrors };
  if (contact.id) parsed.data.contact_id = contact.id;
  const company = await resolveCompany(supabase, fd);
  if (company.error) return errorState(company.error);
  if (company.id) parsed.data.company_id = company.id;
  const { data: pipe } = await supabase.from("pipelines").select("id").eq("kind", PIPELINE_KIND[parsed.data.kind]).single();
  if (!pipe) return errorState();
  const { data: first } = parsed.data.stage_id
    ? await supabase.from("pipeline_stages").select("id,kind").eq("id", parsed.data.stage_id).eq("pipeline_id", pipe.id).maybeSingle()
    : await supabase.from("pipeline_stages").select("id,kind").eq("pipeline_id", pipe.id).eq("kind", "open").order("position").limit(1).single();
  if (!first) return errorState();
  const source = parsed.data.contact_id
    ? (await supabase.from("contacts").select("source").eq("id", parsed.data.contact_id).single()).data?.source ?? "manual" : "manual";
  const { data, error } = await supabase.from("opportunities")
    .insert({
      ...toRow(parsed.data), pipeline_id: pipe.id, stage_id: first.id, source,
      // Creata direttamente in "Prenotato": il valore indicato è quello concordato. In "Non interessato": motivo generico.
      ...(first.kind === "won" && parsed.data.expected_value != null ? { agreed_value_cents: grossCents(parsed.data.expected_value, parsed.data.expected_value_vat) } : {}),
      ...(first.kind === "lost" ? { lost_reason: t.sales.lostReasons[t.sales.lostReasons.length - 1] } : {}),
    }).select("id").single();
  if (error || !data) return errorState();
  await logActivity(supabase, { opportunity_id: data.id, type: "created", summary: "Lead creato" });
  revalidatePath("/sales");
  return { ok: true };
}

/** Durata in ore ("2", "2,5") → minuti. */
const hoursField = z.string().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  const h = Number(v.replace(",", "."));
  const m = Math.round(h * 60);
  if (!Number.isFinite(h) || m < 1 || m > 10080) { ctx.addIssue({ code: "custom", message: t.validation.number }); return z.NEVER; }
  return m;
});
/** Cambia il tipo (Eventi ↔ Individui): la scheda passa all'altra pipeline, nella fase con lo stesso nome. */
async function moveToKind(supabase: Awaited<ReturnType<typeof createClient>>, id: string, kind: OppKind): Promise<ActionState> {
  const { data: cur } = await supabase.from("opportunities").select("kind,stage_id,pipeline_stages(name,kind)").eq("id", id).single();
  if (!cur) return errorState();
  if (cur.kind === kind) return { ok: true };
  const { data: pipe } = await supabase.from("pipelines").select("id").eq("kind", PIPELINE_KIND[kind]).single();
  if (!pipe) return errorState();
  const from = cur.pipeline_stages as unknown as { name: string; kind: string } | null;
  const { data: stages } = await supabase.from("pipeline_stages").select("id,name,kind,position").eq("pipeline_id", pipe.id).order("position");
  const target = stages?.find((s) => s.name === from?.name) ?? stages?.find((s) => s.kind === (from?.kind ?? "open"));
  if (!target) return errorState();
  const { error } = await supabase.from("opportunities").update({ kind, pipeline_id: pipe.id, stage_id: target.id }).eq("id", id);
  if (error) return errorState();
  await logActivity(supabase, { opportunity_id: id, type: "updated", summary: `Tipo: ${kind === "individual" ? "Individui" : "Eventi"}` });
  revalidatePath(`/sales/${id}`); revalidatePath("/sales");
  return { ok: true };
}

const FIELD_SCHEMAS = {
  expected_value: euroField, event_type: text(100), event_date: dateField, attendees: intField(1, 100000), duration: hoursField,
  source: z.enum([...t.sourceOptions, "unknown"]).optional(),
  kind: z.enum(["event", "individual"]).optional(),
  vat: euroField,
} as const;
export type OppField = keyof typeof FIELD_SCHEMAS;

/** Modifica di un singolo campo dalla scheda (clic → modifica → fuori = salva). Valore vuoto = campo svuotato. */
export async function updateOpportunityField(id: string, field: OppField, raw: string): Promise<ActionState> {
  const schema = FIELD_SCHEMAS[field];
  if (!schema) return errorState();
  const parsed = schema.safeParse(raw.trim() === "" ? undefined : raw.trim());
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.validation.required };
  const v = parsed.data ?? null;
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  if (field === "expected_value" || field === "vat") {
    // Valore = netto (la nostra parte); l'IVA si aggiunge (22% in automatico finché non è stata modificata) e si memorizza il lordo.
    const { data: cur } = await supabase.from("opportunities").select("agreed_value_cents,expected_value_cents,vat_cents,kind").eq("id", id).single();
    const rate = cur?.kind === "individual" ? 0 : DEFAULT_VAT_RATE; // individui: IVA 0 di default
    const grossNow = cur?.agreed_value_cents ?? cur?.expected_value_cents ?? null;
    const vatNow = cur?.vat_cents ?? 0;
    const netNow = grossNow != null ? grossNow - vatNow : null;
    let net: number | null, vat: number | null;
    if (field === "expected_value") {
      net = (v as number | null);
      vat = net == null ? null : netNow == null || vatNow === autoVatCents(netNow, rate) ? autoVatCents(net, rate) : vatNow;
    } else {
      if (netNow == null) return { error: t.money.needValue };
      net = netNow; vat = (v as number | null) ?? 0;
    }
    const gross = net == null ? null : net + (vat ?? 0);
    row.expected_value_cents = gross; row.vat_cents = vat;
    if (cur?.agreed_value_cents != null && gross != null) row.agreed_value_cents = gross;
  } else if (field === "kind") return moveToKind(supabase, id, parseKind(v));
  else if (field === "duration") row.duration_minutes = v;
  else if (field === "source") row.source = v ?? "unknown";
  else row[field] = v;
  const { error } = await supabase.from("opportunities").update(row).eq("id", id);
  if (error) return errorState();
  revalidatePath(`/sales/${id}`); revalidatePath("/sales");
  return { ok: true };
}

export async function updateOpportunity(id: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(oppSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const company = await resolveCompany(supabase, fd);
  if (company.error) return errorState(company.error);
  if (company.id) parsed.data.company_id = company.id;
  const row: Record<string, unknown> = toRow(parsed.data);
  // Un solo "Valore": su una trattativa già chiusa aggiorna anche il valore concordato, che alimenta il residuo da incassare.
  const { data: cur } = await supabase.from("opportunities").select("agreed_value_cents").eq("id", id).single();
  if (cur?.agreed_value_cents != null && parsed.data.expected_value != null) row.agreed_value_cents = row.expected_value_cents;
  delete row.kind; // il tipo si cambia con lo spostamento di pipeline, più sotto
  const { error } = await supabase.from("opportunities").update(row).eq("id", id);
  if (error) return errorState();
  const moved = await moveToKind(supabase, id, parsed.data.kind);
  if (!moved.ok) return moved;
  await logActivity(supabase, { opportunity_id: id, type: "updated", summary: "Dati della trattativa aggiornati" });
  revalidatePath(`/sales/${id}`); revalidatePath("/sales");
  return { ok: true };
}

/** Sposta una trattativa di fase. Per una fase "persa" il motivo è obbligatorio. Ogni passaggio è registrato dal trigger del database. */
export async function moveOpportunity(id: string, stageId: string, lostReason?: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: stage } = await supabase.from("pipeline_stages").select("id,name,kind").eq("id", stageId).single();
  if (!stage) return errorState();
  const reason = lostReason?.trim().slice(0, 200);
  if (stage.kind === "lost" && !reason) return { error: t.sales.lostTitle };
  const { data: before } = await supabase.from("opportunities").select("stage_id,pipeline_stages(name)").eq("id", id).single();
  const patch: Record<string, unknown> = { stage_id: stageId };
  if (stage.kind === "lost") patch.lost_reason = reason;
  if (stage.kind === "won") {
    // Spostamento diretto in "Prenotato": il valore già indicato diventa il valore concordato.
    const { data: cur } = await supabase.from("opportunities").select("agreed_value_cents,expected_value_cents").eq("id", id).single();
    if (cur?.agreed_value_cents == null && cur?.expected_value_cents != null) patch.agreed_value_cents = cur.expected_value_cents;
  }
  const { error } = await supabase.from("opportunities").update(patch).eq("id", id);
  if (error) return errorState(/pipeline/i.test(error.message) ? t.common.genericError : undefined);
  const from = (before?.pipeline_stages as unknown as { name: string } | null)?.name;
  await logActivity(supabase, { opportunity_id: id, type: "stage", summary: `Fase: ${from ?? "—"} → ${stage.name}` });
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`);
  return { ok: true };
}

const closeSchema = z.object({
  total: euroField.refine((v) => v !== undefined, { message: t.validation.required }), total_vat: euroField,
  collected: euroField, collected_vat: euroField, paid_on: dateField, method: z.enum(METHODS).default("bank_transfer"),
});

/**
 * Chiude una scheda come vinta: fissa il valore totale e, se indicato, registra il primo incasso con la sua data.
 * Gli incassi successivi si aggiungono dalla scheda (tab Pagamenti). Solo owner/admin registrano incassi.
 */
export async function closeOpportunity(id: string, stageId: string, fd: FormData): Promise<ActionState & { totalCents?: number; vatCents?: number; collectedCents?: number }> {
  const parsed = parseForm(closeSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const me = await getProfile();
  const supabase = await createClient();
  const { data: stage } = await supabase.from("pipeline_stages").select("name,kind").eq("id", stageId).single();
  if (!stage || stage.kind !== "won") return errorState();
  const totalGross = grossCents(d.total, d.total_vat) ?? 0;
  const collected = grossCents(d.collected ?? 0, d.collected_vat) ?? 0;
  if (collected > 0 && !can(me.role, "payments.record")) return errorState(t.common.notAllowed);
  const paidAt = d.paid_on ? romeLocalToUtc(`${d.paid_on}T12:00`) : new Date();
  if (!paidAt) return { fieldErrors: { paid_on: t.validation.date } };

  const { data: before } = await supabase.from("opportunities").select("contact_id,company_id,pipeline_stages(name)").eq("id", id).single();
  if (!before) return errorState();
  const { error } = await supabase.from("opportunities").update({ stage_id: stageId, agreed_value_cents: totalGross, vat_cents: d.total_vat ?? 0 }).eq("id", id);
  if (error) return errorState();
  const from = (before.pipeline_stages as unknown as { name: string } | null)?.name;
  await logActivity(supabase, { opportunity_id: id, type: "stage", summary: `Fase: ${from ?? "—"} → ${stage.name}` });
  if (collected > 0) {
    const { error: payError } = await supabase.from("payments").insert({
      kind: "payment", amount_cents: collected, method: d.method, paid_at: paidAt.toISOString(), vat_rate: vatRateOf(d.collected ?? 0, d.collected_vat),
      contact_id: before.contact_id, company_id: before.company_id, opportunity_id: id, recorded_by: me.id, reference: "Chiusura",
    });
    if (payError) return { error: t.sales.closePaymentFailed };
    await logActivity(supabase, { opportunity_id: id, type: "payment", summary: "Pagamento registrato" });
  }
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`); revalidatePath("/finance"); revalidatePath("/dashboard");
  return { ok: true, totalCents: totalGross, vatCents: d.total_vat ?? 0, collectedCents: collected };
}

export async function moveOpportunityForm(id: string, fd: FormData) {
  await moveOpportunity(id, String(fd.get("stage_id") ?? ""), String(fd.get("lost_reason") ?? ""));
}

export async function deleteOpportunity(id: string) {
  const me = await getProfile();
  if (!can(me.role, "contacts.archive")) return;
  const supabase = await createClient();
  await supabase.from("opportunities").delete().eq("id", id);
  revalidatePath("/sales");
  redirect("/sales");
}

/** Tutte le fasi della pipeline (anche Prenotato e Non interessato), per il menu del nuovo evento. */
export async function listStages(kind: OppKind = "event"): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data: pipe } = await supabase.from("pipelines").select("id").eq("kind", PIPELINE_KIND[parseKind(kind)]).single();
  const { data } = await supabase.from("pipeline_stages").select("id,name").eq("pipeline_id", pipe?.id ?? "").order("position");
  return data ?? [];
}

/** Duplica un evento (dati, non note né pagamenti): la copia parte nella stessa fase se aperta, altrimenti in "Da contattare". */
export async function duplicateOpportunity(id: string) {
  const supabase = await createClient();
  const { data: o } = await supabase.from("opportunities")
    .select("pipeline_id,stage_id,kind,name,contact_id,company_id,owner_id,source,event_type,event_date,attendees,duration_minutes,expected_value_cents,agreed_value_cents,vat_cents,pipeline_stages(kind)").eq("id", id).single();
  if (!o) return;
  let stage = o.stage_id;
  if ((o.pipeline_stages as unknown as { kind: string } | null)?.kind !== "open") {
    const { data: first } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", o.pipeline_id).eq("kind", "open").order("position").limit(1).single();
    if (!first) return;
    stage = first.id;
  }
  const { data: copy } = await supabase.from("opportunities").insert({
    pipeline_id: o.pipeline_id, stage_id: stage, name: o.name, contact_id: o.contact_id, company_id: o.company_id, owner_id: o.owner_id, source: o.source,
    kind: o.kind, event_type: o.event_type, event_date: o.event_date, attendees: o.attendees, duration_minutes: o.duration_minutes,
    expected_value_cents: o.agreed_value_cents ?? o.expected_value_cents, vat_cents: o.vat_cents,
  }).select("id").single();
  if (copy) await logActivity(supabase, { opportunity_id: copy.id, type: "created", summary: "Duplicato da un altro evento" });
  revalidatePath("/sales");
}

/** Tipi di evento già usati nelle trattative (per i menu a tendina). */
export async function listEventTypes(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("event_type").not("event_type", "is", null).limit(1000);
  return [...new Set((data ?? []).map((x) => x.event_type as string))].sort((a, b) => a.localeCompare(b));
}

/** Ricerca contatti per i selettori (nome, email, telefono). */
export async function searchContacts(q: string): Promise<{ id: string; name: string; sub: string }[]> {
  const term = cleanSearch(q);
  const supabase = await createClient();
  // Senza testo: l'elenco dei contatti in ordine alfabetico, così il menu non è mai vuoto.
  if (term.length < 2) {
    const { data } = await supabase.from("contacts").select("id,display_name,email,phone").is("archived_at", null).order("display_name").limit(50);
    return (data ?? []).map((c) => ({ id: c.id, name: c.display_name ?? t.contacts.noName, sub: [c.email, c.phone].filter(Boolean).join(" · ") }));
  }
  const parts = [`display_name.ilike.%${term}%`, `email.ilike.%${term}%`];
  const digits = normalizePhone(term);
  if (digits && digits.length >= 3) parts.push(`phone_norm.ilike.%${digits}%`);
  const { data } = await supabase.from("contacts").select("id,display_name,email,phone").is("archived_at", null).or(parts.join(",")).order("display_name").limit(20);
  return (data ?? []).map((c) => ({ id: c.id, name: c.display_name ?? t.contacts.noName, sub: [c.email, c.phone].filter(Boolean).join(" · ") }));
}

// ---------------------------------------------------------------- attività
const taskSchema = z.object({
  title: z.string().min(1, t.validation.required).max(200, t.validation.tooLong),
  due_date: dateField,
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  assigned_to: uuid, contact_id: uuid, company_id: uuid, opportunity_id: uuid,
});

export async function createTask(revalidate: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(taskSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const me = await getProfile();
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.from("tasks").insert({
    title: d.title, due_date: d.due_date ?? null, priority: d.priority, assigned_to: d.assigned_to ?? me.id,
    contact_id: d.contact_id ?? null, company_id: d.company_id ?? null, opportunity_id: d.opportunity_id ?? null,
  });
  if (error) return errorState();
  revalidatePath(revalidate); revalidatePath("/sales"); revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleTask(id: string, done: boolean, revalidate: string) {
  const me = await getProfile();
  const supabase = await createClient();
  await supabase.from("tasks").update(done ? { done_at: new Date().toISOString(), done_by: me.id } : { done_at: null, done_by: null }).eq("id", id);
  revalidatePath(revalidate); revalidatePath("/dashboard"); revalidatePath("/sales");
}

export async function deleteTask(id: string, revalidate: string) {
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath(revalidate); revalidatePath("/dashboard");
}
