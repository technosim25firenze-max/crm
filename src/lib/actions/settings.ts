"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can, ROLES } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";
import { errorState, parseForm, type ActionState } from "./shared";

const inviteSchema = z.object({ email: z.email(t.validation.email), role: z.enum(ROLES).default("staff") });

export async function inviteUser(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "users.manage")) return errorState(t.settings.onlyOwner);
  const parsed = parseForm(inviteSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const admin = createAdminClient();
  if (!admin) return errorState(t.settings.adminKeyMissing);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${site}/set-password` });
  if (error || !data.user) return errorState();
  if (parsed.data.role !== "staff") await admin.from("profiles").update({ role: parsed.data.role }).eq("id", data.user.id);
  revalidatePath("/settings/users");
  return { ok: true };
}

async function activeOwners() {
  const supabase = await createClient();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
  return count ?? 0;
}

export async function setUserRole(userId: string, fd: FormData) {
  const me = await getProfile();
  if (!can(me.role, "users.manage")) return;
  const role = z.enum(ROLES).safeParse(fd.get("role"));
  if (!role.success) return;
  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (target?.role === "owner" && role.data !== "owner" && (await activeOwners()) <= 1) return;
  await supabase.from("profiles").update({ role: role.data }).eq("id", userId);
  revalidatePath("/settings/users");
}

export async function setUserActive(userId: string, active: boolean) {
  const me = await getProfile();
  if (!can(me.role, "users.manage") || (userId === me.id && !active)) return;
  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!active && target?.role === "owner" && (await activeOwners()) <= 1) return;
  await supabase.from("profiles").update({ active }).eq("id", userId);
  revalidatePath("/settings/users");
}
