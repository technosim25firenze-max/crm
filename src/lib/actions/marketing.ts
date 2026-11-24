"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";
import { euroField, intField } from "./fields";
import { errorState, parseForm, type ActionState } from "./shared";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t.validation.date);
const spendSchema = z.object({
  platform: z.enum(["meta", "google", "other"]),
  campaign: z.string().max(200).optional(),
  period_start: day, period_end: day,
  amount: euroField.refine((v) => v !== undefined, { message: t.validation.required }),
  impressions: intField(0, 2_000_000_000), clicks: intField(0, 2_000_000_000), leads: intField(0, 2_000_000_000),
  notes: z.string().max(500).optional(),
}).refine((v) => v.period_end >= v.period_start, { message: t.validation.date, path: ["period_end"] });

export async function addSpend(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "marketing.spend")) return errorState(t.common.notAllowed);
  const parsed = parseForm(spendSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_spend").insert({
    platform: d.platform, campaign: d.campaign ?? null, period_start: d.period_start, period_end: d.period_end, amount_cents: d.amount,
    impressions: d.impressions ?? null, clicks: d.clicks ?? null, leads: d.leads ?? null, notes: d.notes ?? null,
  });
  if (error) return errorState();
  revalidatePath("/analytics");
  return { ok: true };
}

export async function deleteSpend(id: string) {
  const me = await getProfile();
  if (!can(me.role, "marketing.spend")) return;
  const supabase = await createClient();
  await supabase.from("marketing_spend").delete().eq("id", id);
  revalidatePath("/analytics");
}
