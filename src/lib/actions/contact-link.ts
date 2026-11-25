import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { findDuplicates, logActivity } from "./shared";
import { t } from "@/lib/i18n/it";

export interface ResolvedContact { id?: string; reused?: boolean; fieldErrors?: Record<string, string> }

/**
 * Risolve il contatto scelto in un form: un contatto esistente (`contact_id`) oppure uno nuovo (`new_*`).
 * Se i dati del nuovo contatto coincidono (email o telefono) con uno esistente, si riusa quello: mai duplicati.
 */
export async function resolveContact(supabase: SupabaseClient, fd: FormData): Promise<ResolvedContact> {
  const id = String(fd.get("contact_id") ?? "").trim();
  if (id) return z.string().uuid().safeParse(id).success ? { id } : { fieldErrors: { contact_id: t.validation.required } };
  const first = String(fd.get("new_first_name") ?? "").trim() || null;
  const last = String(fd.get("new_last_name") ?? "").trim() || null;
  const email = String(fd.get("new_email") ?? "").trim() || null;
  const phone = String(fd.get("new_phone") ?? "").trim() || null;
  if (!first && !last && !email && !phone) return {};
  if (!first && !last) return { fieldErrors: { contact_id: t.validation.nameRequired } };
  if (email && !z.email().safeParse(email).success) return { fieldErrors: { contact_id: t.validation.email } };
  const dup = await findDuplicates(supabase, email, phone);
  if (dup.length) return { id: dup[0].id, reused: true };
  const { data, error } = await supabase.from("contacts").insert({ first_name: first, last_name: last, email, phone, source: "unknown" }).select("id").single();
  if (error || !data) return { fieldErrors: { contact_id: t.common.genericError } };
  await logActivity(supabase, { contact_id: data.id, type: "created", summary: "Contatto creato" });
  return { id: data.id };
}
