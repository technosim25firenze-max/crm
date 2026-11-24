import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";
import { can, type Permission } from "./permissions";

/** Utente corrente con ruolo. Reindirizza al login se la sessione manca o l'account è disattivato. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data } = await supabase.from("profiles").select("id,email,full_name,role,active").eq("id", auth.user.id).single();
  if (!data || !data.active) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  return data as Profile;
});

export async function requirePermission(permission: Permission): Promise<Profile> {
  const profile = await getProfile();
  if (!can(profile.role, permission)) redirect("/dashboard");
  return profile;
}
