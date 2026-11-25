"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { classifyRows, type ImportRow, type RowResult } from "@/lib/import";
import { normalizeEmail, normalizePhone } from "@/lib/phone";
import { t } from "@/lib/i18n/it";

const MAX_ROWS = 2000;
const cell = z.string().max(200).optional();
const rowsSchema = z.array(z.object({ first_name: cell, last_name: cell, email: cell, phone: cell, city: cell, company: cell })).max(MAX_ROWS);

async function analyze(rows: ImportRow[]): Promise<RowResult[]> {
  const supabase = await createClient();
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter((x): x is string => !!x))];
  const phones = [...new Set(rows.map((r) => normalizePhone(r.phone)).filter((x): x is string => !!x))];
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("contacts").select("email_norm").in("email_norm", emails.slice(i, i + 200));
    data?.forEach((d) => d.email_norm && existingEmails.add(d.email_norm));
  }
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase.from("contacts").select("phone_norm").in("phone_norm", phones.slice(i, i + 200));
    data?.forEach((d) => d.phone_norm && existingPhones.add(d.phone_norm));
  }
  return classifyRows(rows, existingEmails, existingPhones);
}

export async function previewImport(raw: unknown): Promise<{ results?: RowResult[]; error?: string }> {
  const me = await getProfile();
  if (!can(me.role, "contacts.import")) return { error: t.common.notAllowed };
  const parsed = rowsSchema.safeParse(raw);
  if (!parsed.success) return { error: t.settings.tooMany };
  return { results: await analyze(parsed.data) };
}

/** Rianalizza le righe lato server (non si fida dell'anteprima del client) e inserisce solo quelle valide. */
export async function commitImport(raw: unknown, filename: string): Promise<{ created?: number; skipped?: number; errors?: number; error?: string }> {
  const me = await getProfile();
  if (!can(me.role, "contacts.import")) return { error: t.common.notAllowed };
  const parsed = rowsSchema.safeParse(raw);
  if (!parsed.success) return { error: t.settings.tooMany };
  const rows = parsed.data;
  const results = await analyze(rows);
  const supabase = await createClient();

  const good = rows.filter((_, i) => results[i].status === "ok");
  let created = 0;
  for (let i = 0; i < good.length; i += 200) {
    const chunk = good.slice(i, i + 200);
    const { data, error } = await supabase.from("contacts").insert(chunk.map((r) => ({
      first_name: r.first_name?.trim() || null, last_name: r.last_name?.trim() || null,
      email: r.email?.trim() || null, phone: r.phone?.trim() || null, city: r.city?.trim() || null,
      source: "unknown", attribution_status: "unknown", // origine storica ignota: non si presume marketing
    }))).select("id");
    if (error || !data) return { error: t.common.genericError, created };
    created += data.length;
    await supabase.from("activities").insert(data.map((d) => ({ contact_id: d.id, type: "import", summary: `Importato da ${filename.slice(0, 80)}` })));

    // Collega le aziende indicate nel file (create se mancanti, confronto senza maiuscole).
    for (let j = 0; j < data.length; j++) {
      const name = chunk[j].company?.trim();
      if (!name) continue;
      const { data: found } = await supabase.from("companies").select("id,name").ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1);
      let companyId = found?.[0]?.id as string | undefined;
      if (!companyId) companyId = (await supabase.from("companies").insert({ name, source: "import" }).select("id").single()).data?.id;
      if (companyId) await supabase.from("company_contacts").upsert({ company_id: companyId, contact_id: data[j].id });
    }
  }
  const skipped = results.filter((r) => r.status === "duplicate").length;
  const errors = results.filter((r) => r.status === "error").length;
  await supabase.from("import_jobs").insert({ filename: filename.slice(0, 200), total_rows: rows.length, created_rows: created, skipped_rows: skipped, error_rows: errors });
  revalidatePath("/contacts");
  return { created, skipped, errors };
}
