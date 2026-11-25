"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLeadStage } from "@/lib/leads";
import { t } from "@/lib/i18n/it";
import { errorState, logActivity, type ActionState } from "./shared";

/** Sposta un contatto in una fase della bacheca lead (null lo toglie dalla bacheca). */
export async function moveLead(id: string, stage: string | null): Promise<ActionState> {
  if (stage !== null && !isLeadStage(stage)) return errorState();
  const supabase = await createClient();
  const { data: before } = await supabase.from("contacts").select("lead_stage").eq("id", id).single();
  if (!before) return errorState();
  if (before.lead_stage === stage) return { ok: true };
  const { error } = await supabase.from("contacts").update({ lead_stage: stage }).eq("id", id);
  if (error) return errorState();
  const label = (s: string | null) => (s ? t.leads.stages[s as keyof typeof t.leads.stages] : t.leads.notALead);
  await logActivity(supabase, { contact_id: id, type: "lead_stage", summary: `Fase lead: ${label(before.lead_stage)} → ${label(stage)}` });
  revalidatePath("/leads"); revalidatePath(`/contacts/${id}`);
  return { ok: true };
}
