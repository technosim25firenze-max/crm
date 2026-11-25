"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";
import { errorState, findDuplicates, logActivity, parseForm, type ActionState } from "./shared";

const kinds = ["b2c", "b2b", "supplier"] as const;
const lifecycles = ["prospect", "active", "returning", "inactive"] as const;
const sources = Object.keys(t.sources) as [keyof typeof t.sources, ...(keyof typeof t.sources)[]];
const channels = ["email", "phone", "whatsapp"] as const;
const text = (max = 300) => z.string().max(max, t.validation.tooLong).optional();

const contactSchema = z.object({
  first_name: text(100),
  last_name: text(100),
  email: z.email(t.validation.email).max(200).optional(),
  phone: text(40),
  city: text(100),
  country: text(100),
  job_title: text(100),
  company_name: text(200),
  kind: z.enum(kinds).default("b2c"),
  lifecycle: z.enum(lifecycles).default("prospect"),
  source: z.enum(sources).default("unknown"),
  source_detail: text(300),
  preferred_channel: z.enum(channels).optional(),
  sim_preferences: text(1000),
}).refine((v) => !!(v.first_name || v.last_name), { message: t.validation.nameRequired, path: ["first_name"] });

const UPDATE_KEYS = ["first_name", "last_name", "email", "phone", "city", "country", "job_title", "kind", "lifecycle",
  "source", "source_detail", "preferred_channel", "sim_preferences"] as const;

export async function createContact(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(contactSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();

  if (fd.get("confirm") !== "1") {
    const duplicates = await findDuplicates(supabase, parsed.data.email, parsed.data.phone);
    if (duplicates.length) return { duplicates };
  }
  const { company_name, ...contact } = parsed.data;
  const { data, error } = await supabase.from("contacts").insert({ ...contact, lead_stage: "to_contact" }).select("id").single();
  if (error || !data) return errorState();
  if (company_name) {
    // Riusa l'azienda con lo stesso nome (senza distinguere maiuscole), altrimenti la crea.
    const pattern = company_name.replace(/[\\%_]/g, "\\$&");
    let companyId = (await supabase.from("companies").select("id").ilike("name", pattern).limit(1).maybeSingle()).data?.id;
    if (!companyId) companyId = (await supabase.from("companies").insert({ name: company_name, first_contact_at: new Date().toISOString() }).select("id").single()).data?.id;
    if (companyId) await supabase.from("company_contacts").upsert({ contact_id: data.id, company_id: companyId, role: contact.job_title ?? null });
  }
  await logActivity(supabase, { contact_id: data.id, type: "created", summary: "Contatto creato" });
  revalidatePath("/contacts");
  redirect(`/contacts/${data.id}`);
}

export async function updateContact(id: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(contactSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const payload = Object.fromEntries(UPDATE_KEYS.map((k) => [k, parsed.data[k] ?? null]));
  payload.kind = parsed.data.kind; payload.lifecycle = parsed.data.lifecycle; payload.source = parsed.data.source;
  const { error } = await supabase.from("contacts").update(payload).eq("id", id);
  if (error) return errorState();
  await logActivity(supabase, { contact_id: id, type: "updated", summary: "Dati del contatto aggiornati" });
  revalidatePath(`/contacts/${id}`);
  return { ok: true };
}

export async function addContactTag(contactId: string, fd: FormData) {
  const name = String(fd.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;
  const supabase = await createClient();
  const { data: tags } = await supabase.from("tags").select("id,name");
  let tagId = tags?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.id;
  if (!tagId) {
    const created = await supabase.from("tags").insert({ name }).select("id").single();
    tagId = created.data?.id;
  }
  if (tagId) await supabase.from("contact_tags").upsert({ contact_id: contactId, tag_id: tagId });
  revalidatePath(`/contacts/${contactId}`);
}

export async function removeContactTag(contactId: string, tagId: string) {
  const supabase = await createClient();
  await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
  revalidatePath(`/contacts/${contactId}`);
}

export async function archiveContact(id: string) {
  const profile = await getProfile();
  if (!can(profile.role, "contacts.archive")) return;
  const supabase = await createClient();
  await supabase.from("contacts").update({ archived_at: new Date().toISOString() }).eq("id", id);
  await logActivity(supabase, { contact_id: id, type: "archived", summary: "Contatto archiviato" });
  revalidatePath("/contacts");
  redirect("/contacts");
}

/** Unisce `dropId` in `keepId` (funzione SQL atomica, solo owner/admin). */
export async function mergeContacts(keepId: string, dropId: string) {
  const profile = await getProfile();
  if (!can(profile.role, "contacts.merge")) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_contacts", { keep: keepId, drop_id: dropId });
  if (error) return;
  revalidatePath("/contacts");
  redirect(`/contacts/${keepId}`);
}

export async function setDoNotContact(id: string, value: boolean) {
  const supabase = await createClient();
  await supabase.from("contacts").update({ do_not_contact: value }).eq("id", id);
  await logActivity(supabase, { contact_id: id, type: "consent", summary: value ? "Impostato: non contattare" : "Rimosso: non contattare" });
  revalidatePath(`/contacts/${id}`);
}
