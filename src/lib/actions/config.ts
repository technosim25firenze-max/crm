"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";
import { euroField, intField } from "./fields";
import { errorState, formToObject, parseForm, type ActionState } from "./shared";

async function guard() {
  const me = await getProfile();
  return can(me.role, "config.manage");
}
const name = z.string().min(1, t.validation.required).max(80, t.validation.tooLong);

// ---------------------------------------------------------------- pipeline
async function rewritePositions(ids: string[]) {
  const supabase = await createClient();
  await Promise.all(ids.map((id, i) => supabase.from("pipeline_stages").update({ position: i + 1 }).eq("id", id)));
}

export async function renameStage(id: string, fd: FormData) {
  if (!(await guard())) return;
  const p = z.object({ name }).safeParse(formToObject(fd));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("pipeline_stages").update({ name: p.data.name }).eq("id", id);
  revalidatePath("/settings/pipelines"); revalidatePath("/sales");
}

export async function moveStage(id: string, pipelineId: string, dir: -1 | 1) {
  if (!(await guard())) return;
  const supabase = await createClient();
  const { data } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", pipelineId).order("position");
  const ids = (data ?? []).map((s) => s.id);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await rewritePositions(ids);
  revalidatePath("/settings/pipelines"); revalidatePath("/sales");
}

export async function addStage(pipelineId: string, fd: FormData) {
  if (!(await guard())) return;
  const p = z.object({ name, kind: z.enum(["open", "won", "lost"]).default("open") }).safeParse(formToObject(fd));
  if (!p.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("pipeline_stages").select("id,kind").eq("pipeline_id", pipelineId).order("position");
  const list = data ?? [];
  const { data: created } = await supabase.from("pipeline_stages").insert({ pipeline_id: pipelineId, name: p.data.name, kind: p.data.kind, position: list.length + 1 }).select("id").single();
  if (!created) return;
  // Le fasi "in corso" si inseriscono prima della prima fase finale (acquisita/persa).
  const firstTerminal = list.findIndex((s) => s.kind !== "open");
  const ids = list.map((s) => s.id);
  if (p.data.kind === "open" && firstTerminal >= 0) ids.splice(firstTerminal, 0, created.id); else ids.push(created.id);
  await rewritePositions(ids);
  revalidatePath("/settings/pipelines"); revalidatePath("/sales");
}

export async function deleteStage(id: string, pipelineId: string): Promise<void> {
  if (!(await guard())) return;
  const supabase = await createClient();
  const { count } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("stage_id", id);
  if (count) return; // la UI mostra l'avviso: la fase contiene trattative
  const { data } = await supabase.from("pipeline_stages").select("id,kind").eq("pipeline_id", pipelineId);
  const target = data?.find((s) => s.id === id);
  if (!target) return;
  if (target.kind !== "open" && (data ?? []).filter((s) => s.kind === target.kind).length <= 1) return; // serve almeno una acquisita e una persa
  await supabase.from("pipeline_stages").delete().eq("id", id);
  await rewritePositions((data ?? []).filter((s) => s.id !== id).map((s) => s.id));
  revalidatePath("/settings/pipelines"); revalidatePath("/sales");
}

// ---------------------------------------------------------------- servizi
const serviceSchema = z.object({
  name, category: z.string().max(80).optional(), price: euroField, duration: intField(1, 1440),
  vat_rate: z.string().optional().transform((v, ctx) => {
    if (v === undefined) return 22;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) { ctx.addIssue({ code: "custom", message: t.validation.number }); return z.NEVER; }
    return n;
  }),
});

export async function createService(_: ActionState | null, fd: FormData): Promise<ActionState> {
  if (!(await guard())) return errorState(t.common.notAllowed);
  const p = parseForm(serviceSchema, fd);
  if (p.fieldErrors) return { fieldErrors: p.fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ name: p.data.name, category: p.data.category ?? null, default_price_cents: p.data.price ?? null, duration_minutes: p.data.duration ?? null, vat_rate: p.data.vat_rate });
  if (error) return errorState();
  revalidatePath("/settings/services");
  return { ok: true };
}

export async function updateService(id: string, fd: FormData) {
  if (!(await guard())) return;
  const p = serviceSchema.safeParse(formToObject(fd));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("services").update({ name: p.data.name, category: p.data.category ?? null, default_price_cents: p.data.price ?? null, duration_minutes: p.data.duration ?? null, vat_rate: p.data.vat_rate }).eq("id", id);
  revalidatePath("/settings/services");
}

export async function setServiceActive(id: string, active: boolean) {
  if (!(await guard())) return;
  const supabase = await createClient();
  await supabase.from("services").update({ active }).eq("id", id);
  revalidatePath("/settings/services");
}

// ---------------------------------------------------------------- categorie e tag
export async function createExpenseCategory(fd: FormData) {
  if (!(await guard())) return;
  const p = z.object({ name, kind: z.enum(["fixed", "variable"]).default("fixed") }).safeParse(formToObject(fd));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("expense_categories").insert(p.data);
  revalidatePath("/settings/categories");
}

export async function deleteExpenseCategory(id: string) {
  if (!(await guard())) return;
  const supabase = await createClient();
  await supabase.from("expense_categories").delete().eq("id", id);
  revalidatePath("/settings/categories");
}

export async function renameTag(id: string, fd: FormData) {
  if (!(await guard())) return;
  const p = z.object({ name }).safeParse(formToObject(fd));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("tags").update({ name: p.data.name }).eq("id", id);
  revalidatePath("/settings/categories");
}

export async function deleteTag(id: string) {
  if (!(await guard())) return;
  const supabase = await createClient();
  await supabase.from("tags").delete().eq("id", id);
  revalidatePath("/settings/categories");
}

/** Attiva/disattiva la replica come pagamenti dell'incassato dichiarato dalla piattaforma di prenotazione. */
export async function setPlatformPayments(value: boolean) {
  if (!(await guard())) return;
  const supabase = await createClient();
  await supabase.from("organization_settings").update({ import_platform_payments: value }).eq("id", true);
  revalidatePath("/settings/integrations");
}
