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
import { dateField, euroField, intField, uuid } from "./fields";
import { resolveContact } from "./contact-link";
import { errorState, logActivity, parseForm, type ActionState } from "./shared";

const text = (n = 200) => z.string().max(n, t.validation.tooLong).optional();

const KINDS = ["individual", "event"] as const;
const METHODS = ["cash", "card_pos", "bank_transfer", "gift_card", "other"] as const;

const oppSchema = z.object({
  kind: z.enum(KINDS).default("event"),
  name: z.string().min(1, t.validation.required).max(200, t.validation.tooLong),
  contact_id: uuid, company_id: uuid,
  expected_value: euroField, probability: intField(0, 100), attendees: intField(1, 100000),
  expected_close_date: dateField, event_date: dateField, event_type: text(100),
  owner_id: uuid,
});

function toRow(d: z.output<typeof oppSchema>) {
  return {
    name: d.name, kind: d.kind, contact_id: d.contact_id ?? null, company_id: d.company_id ?? null,
    expected_value_cents: d.expected_value ?? null, probability: d.probability ?? null, attendees: d.attendees ?? null,
    expected_close_date: d.expected_close_date ?? null, event_date: d.event_date ?? null, event_type: d.event_type ?? null,
  };
}

export async function createOpportunity(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(oppSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const contact = await resolveContact(supabase, fd);
  if (contact.fieldErrors) return { fieldErrors: contact.fieldErrors };
  if (contact.id) parsed.data.contact_id = contact.id;
  const { data: pipe } = await supabase.from("pipelines").select("id").eq("kind", "sales").single();
  if (!pipe) return errorState();
  const { data: first } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", pipe.id).eq("kind", "open").order("position").limit(1).single();
  if (!first) return errorState();
  const source = parsed.data.contact_id
    ? (await supabase.from("contacts").select("source").eq("id", parsed.data.contact_id).single()).data?.source ?? "manual" : "manual";
  const { data, error } = await supabase.from("opportunities")
    .insert({ ...toRow(parsed.data), pipeline_id: pipe.id, stage_id: first.id, source }).select("id").single();
  if (error || !data) return errorState();
  await logActivity(supabase, { opportunity_id: data.id, type: "created", summary: "Lead creato" });
  revalidatePath("/sales");
  return { ok: true };
}

export async function updateOpportunity(id: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(oppSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const agreed = fd.get("agreed_value");
  const row: Record<string, unknown> = toRow(parsed.data);
  if (typeof agreed === "string" && agreed.trim() !== "") {
    const p = z.object({ agreed_value: euroField }).safeParse({ agreed_value: agreed.trim() });
    if (!p.success) return { fieldErrors: { agreed_value: t.validation.amount } };
    row.agreed_value_cents = p.data.agreed_value ?? null;
  }
  const { error } = await supabase.from("opportunities").update(row).eq("id", id);
  if (error) return errorState();
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
  const { error } = await supabase.from("opportunities").update(patch).eq("id", id);
  if (error) return errorState(/pipeline/i.test(error.message) ? t.common.genericError : undefined);
  const from = (before?.pipeline_stages as unknown as { name: string } | null)?.name;
  await logActivity(supabase, { opportunity_id: id, type: "stage", summary: `Fase: ${from ?? "—"} → ${stage.name}` });
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`);
  return { ok: true };
}

const closeSchema = z.object({
  total: euroField.refine((v) => v !== undefined, { message: t.validation.required }),
  collected: euroField, paid_on: dateField, method: z.enum(METHODS).default("bank_transfer"),
});

/**
 * Chiude una scheda come vinta: fissa il valore totale e, se indicato, registra il primo incasso con la sua data.
 * Gli incassi successivi si aggiungono dalla scheda (tab Pagamenti). Solo owner/admin registrano incassi.
 */
export async function closeOpportunity(id: string, stageId: string, fd: FormData): Promise<ActionState & { totalCents?: number; collectedCents?: number }> {
  const parsed = parseForm(closeSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const me = await getProfile();
  const supabase = await createClient();
  const { data: stage } = await supabase.from("pipeline_stages").select("name,kind").eq("id", stageId).single();
  if (!stage || stage.kind !== "won") return errorState();
  const collected = d.collected ?? 0;
  if (collected > 0 && !can(me.role, "payments.record")) return errorState(t.common.notAllowed);
  const paidAt = d.paid_on ? romeLocalToUtc(`${d.paid_on}T12:00`) : new Date();
  if (!paidAt) return { fieldErrors: { paid_on: t.validation.date } };

  const { data: before } = await supabase.from("opportunities").select("contact_id,company_id,pipeline_stages(name)").eq("id", id).single();
  if (!before) return errorState();
  const { error } = await supabase.from("opportunities").update({ stage_id: stageId, agreed_value_cents: d.total }).eq("id", id);
  if (error) return errorState();
  const from = (before.pipeline_stages as unknown as { name: string } | null)?.name;
  await logActivity(supabase, { opportunity_id: id, type: "stage", summary: `Fase: ${from ?? "—"} → ${stage.name}` });
  if (collected > 0) {
    const { error: payError } = await supabase.from("payments").insert({
      kind: "payment", amount_cents: collected, method: d.method, paid_at: paidAt.toISOString(), vat_rate: 22,
      contact_id: before.contact_id, company_id: before.company_id, opportunity_id: id, recorded_by: me.id, reference: "Chiusura",
    });
    if (payError) return { error: t.sales.closePaymentFailed };
    await logActivity(supabase, { opportunity_id: id, type: "payment", summary: "Pagamento registrato" });
  }
  revalidatePath("/sales"); revalidatePath(`/sales/${id}`); revalidatePath("/finance"); revalidatePath("/dashboard");
  return { ok: true, totalCents: d.total, collectedCents: collected };
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

/** Ricerca contatti per i selettori (nome, email, telefono). */
export async function searchContacts(q: string): Promise<{ id: string; name: string; sub: string }[]> {
  const term = cleanSearch(q);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const parts = [`display_name.ilike.%${term}%`, `email.ilike.%${term}%`];
  const digits = normalizePhone(term);
  if (digits && digits.length >= 3) parts.push(`phone_norm.ilike.%${digits}%`);
  const { data } = await supabase.from("contacts").select("id,display_name,email,phone").is("archived_at", null).or(parts.join(",")).limit(8);
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
