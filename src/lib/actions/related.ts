"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";
import { romeLocalToUtc, romeToday } from "@/lib/format";
import { dateField } from "./fields";
import { errorState, logActivity, parseForm, type ActionState } from "./shared";

type Parent = { contact_id: string } | { company_id: string } | { opportunity_id: string };
const parentKey = (p: Parent) => ("contact_id" in p ? `/contacts/${p.contact_id}` : "company_id" in p ? `/companies/${p.company_id}` : `/sales/${p.opportunity_id}`);

// ---------------------------------------------------------------- note
export async function addNote(parent: Parent, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(z.object({ body: z.string().min(1, t.validation.required).max(5000, t.validation.tooLong), date: dateField }), fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const profile = await getProfile();
  const supabase = await createClient();
  // Data scelta dal team: se è oggi resta l'ora attuale, altrimenti mezzogiorno di quel giorno (ora di Roma).
  const today = romeToday();
  const todayIso = `${today.y}-${String(today.m).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;
  let created_at: string | undefined;
  if (parsed.data.date && parsed.data.date !== todayIso) {
    if (parsed.data.date > todayIso) return { fieldErrors: { date: t.validation.date } };
    created_at = romeLocalToUtc(`${parsed.data.date}T12:00`)?.toISOString();
  }
  const { error } = await supabase.from("notes").insert({ ...parent, body: parsed.data.body, author_id: profile.id, ...(created_at ? { created_at } : {}) });
  if (error) return errorState();
  await logActivity(supabase, { ...parent, type: "note", summary: "Nota aggiunta" });
  revalidatePath(parentKey(parent));
  return { ok: true };
}

export async function deleteNote(parent: Parent, id: string) {
  const supabase = await createClient();
  await supabase.from("notes").delete().eq("id", id);
  revalidatePath(parentKey(parent));
}

// ---------------------------------------------------------------- documenti
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "image/png", "image/jpeg", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const linkSchema = z.object({
  title: z.string().min(1, t.validation.required).max(150),
  category: z.string().max(60).optional(),
  url: z.url({ protocol: /^https$/, message: t.validation.url }).max(1000).optional(),
});

export async function addDocument(parent: Parent, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(linkSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const profile = await getProfile();
  const supabase = await createClient();
  const file = fd.get("file");
  const row: Record<string, unknown> = { ...parent, title: parsed.data.title, category: parsed.data.category ?? null, uploaded_by: profile.id };

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { fieldErrors: { file: t.documents.tooBig } };
    if (!ALLOWED.has(file.type)) return { fieldErrors: { file: t.documents.badType } };
    const folder = "contact_id" in parent ? `contacts/${parent.contact_id}` : "company_id" in parent ? `companies/${parent.company_id}` : `opportunities/${parent.opportunity_id}`;
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").slice(0, 8) : "bin";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
    if (up.error) return errorState();
    row.storage_path = path;
  } else if (parsed.data.url) {
    row.url = parsed.data.url;
  } else {
    return { fieldErrors: { url: t.validation.required } };
  }
  const { error } = await supabase.from("documents").insert(row);
  if (error) return errorState();
  await logActivity(supabase, { ...parent, type: "document", summary: `Documento aggiunto: ${parsed.data.title}` });
  revalidatePath(parentKey(parent));
  return { ok: true };
}

export async function deleteDocument(parent: Parent, id: string, storagePath: string | null) {
  const profile = await getProfile();
  const supabase = await createClient();
  await supabase.from("documents").delete().eq("id", id);
  if (storagePath && can(profile.role, "contacts.archive")) await supabase.storage.from("documents").remove([storagePath]);
  revalidatePath(parentKey(parent));
}

/** Aggiunge il link di un preventivo a una trattativa (una riga per link). */
export async function addQuote(opportunityId: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(z.object({
    url: z.url({ protocol: /^https$/, message: t.validation.url }).max(1000),
    title: z.string().max(150).optional(),
  }), fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const profile = await getProfile();
  const supabase = await createClient();
  const title = parsed.data.title ?? t.quotes.title.replace(/i$/, "o");
  const { error } = await supabase.from("documents").insert({ opportunity_id: opportunityId, title, category: "Preventivo", url: parsed.data.url, uploaded_by: profile.id });
  if (error) return errorState();
  await logActivity(supabase, { opportunity_id: opportunityId, type: "document", summary: `Preventivo aggiunto: ${title}` });
  revalidatePath(`/sales/${opportunityId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- consensi
const consentSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp", "phone"]),
  status: z.enum(["granted", "withdrawn"]),
  evidence: z.string().max(500).optional(),
});

export async function recordConsent(contactId: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const profile = await getProfile();
  if (!can(profile.role, "consents.record")) return errorState(t.common.notAllowed);
  const parsed = parseForm(consentSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_consents").insert({ contact_id: contactId, ...parsed.data, recorded_by: profile.id });
  if (error) return errorState();
  await logActivity(supabase, { contact_id: contactId, type: "consent", summary: `Consenso ${parsed.data.channel}: ${parsed.data.status === "granted" ? "concesso" : "revocato"}` });
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
