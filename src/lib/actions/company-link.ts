import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "./shared";
import { t } from "@/lib/i18n/it";

/** Risolve l'azienda scelta in un form: esistente (`company_id`) oppure nuova (`new_company_name`, riusa un'azienda con lo stesso nome). */
export async function resolveCompany(supabase: SupabaseClient, fd: FormData): Promise<{ id?: string; error?: string }> {
  const id = String(fd.get("company_id") ?? "").trim();
  if (id) return { id };
  const name = String(fd.get("new_company_name") ?? "").trim().slice(0, 200);
  if (!name) return {};
  const { data: found } = await supabase.from("companies").select("id").ilike("name", name.replace(/[%_]/g, "\\$&")).is("archived_at", null).limit(1);
  if (found?.[0]) return { id: found[0].id };
  const { data, error } = await supabase.from("companies").insert({ name, source: "unknown" }).select("id").single();
  if (error || !data) return { error: t.common.genericError };
  await logActivity(supabase, { company_id: data.id, type: "created", summary: "Azienda creata" });
  return { id: data.id };
}
