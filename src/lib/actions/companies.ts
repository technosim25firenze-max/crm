"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n/it";
import { resolveCompany } from "./company-link";
import { resolveContact } from "./contact-link";
import { errorState, logActivity, parseForm, type ActionState } from "./shared";

const opt = (max = 200) => z.string().max(max, t.validation.tooLong).optional();

const companySchema = z.object({
  name: z.string().min(1, t.validation.required).max(200, t.validation.tooLong),
  vat_number: opt(20),
  industry: opt(100),
  website: z.url({ protocol: /^https?$/, message: t.validation.url }).max(300).optional(),
  phone: opt(40),
  email: z.email(t.validation.email).max(200).optional(),
  address: opt(300),
  city: opt(100),
  size_category: opt(60),
});
const KEYS = ["vat_number", "industry", "website", "phone", "email", "address", "city", "size_category"] as const;

export async function createCompany(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(companySchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").insert({ ...parsed.data, first_contact_at: new Date().toISOString() }).select("id").single();
  if (error || !data) return errorState();
  await logActivity(supabase, { company_id: data.id, type: "created", summary: "Azienda creata" });
  revalidatePath("/companies");
  redirect(`/companies/${data.id}`);
}

export async function updateCompany(id: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(companySchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const payload: Record<string, unknown> = { name: parsed.data.name, ...Object.fromEntries(KEYS.map((k) => [k, parsed.data[k] ?? null])) };
  const { error } = await supabase.from("companies").update(payload).eq("id", id);
  if (error) return errorState();
  await logActivity(supabase, { company_id: id, type: "updated", summary: "Dati dell'azienda aggiornati" });
  revalidatePath(`/companies/${id}`);
  return { ok: true };
}

/** Associa un contatto a un'azienda (molti-a-molti, con ruolo). `from` indica la pagina da aggiornare. */
export async function linkContactCompany(from: string, fd: FormData) {
  const supabase = await createClient();
  const contact = await resolveContact(supabase, fd);
  const company = await resolveCompany(supabase, fd);
  const contactId = contact.id ?? "";
  const companyId = company.id ?? "";
  const role = String(fd.get("role") ?? "").trim().slice(0, 100) || null;
  if (!contactId || !companyId) return;
  await supabase.from("company_contacts").upsert({ contact_id: contactId, company_id: companyId, role });
  await logActivity(supabase, { contact_id: contactId, company_id: companyId, type: "company_linked", summary: "Contatto collegato all'azienda" });
  revalidatePath(from);
}

export async function unlinkContactCompany(from: string, contactId: string, companyId: string) {
  const supabase = await createClient();
  await supabase.from("company_contacts").delete().eq("contact_id", contactId).eq("company_id", companyId);
  revalidatePath(from);
}

export async function archiveCompany(id: string) {
  const me = await getProfile();
  if (!can(me.role, "contacts.archive")) return;
  const supabase = await createClient();
  await supabase.from("companies").update({ archived_at: new Date().toISOString() }).eq("id", id);
  await logActivity(supabase, { company_id: id, type: "archived", summary: "Azienda archiviata" });
  revalidatePath("/companies");
  redirect("/companies");
}
