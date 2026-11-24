import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { t } from "@/lib/i18n/it";
import { normalizeEmail, normalizePhone } from "@/lib/phone";

export interface DuplicateMatch { id: string; display_name: string | null; email: string | null; phone: string | null }

export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  duplicates?: DuplicateMatch[];
  warning?: string;
}

/** FormData → oggetto; stringhe vuote diventano undefined. */
export function formToObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string" || k.startsWith("$ACTION")) continue;
    const s = v.trim();
    out[k] = s === "" ? undefined : s;
  }
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, fd: FormData):
  { data: z.output<S>; fieldErrors?: undefined } | { data?: undefined; fieldErrors: Record<string, string> } {
  const r = schema.safeParse(formToObject(fd));
  if (r.success) return { data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "_form");
    fieldErrors[key] ??= issue.message;
  }
  return { fieldErrors };
}

export async function logActivity(
  supabase: SupabaseClient,
  a: { contact_id?: string; company_id?: string; opportunity_id?: string; type: string; summary: string },
) {
  await supabase.from("activities").insert(a);
}

/** Cerca contatti con stessa email o stesso telefono (normalizzati). Mai solo per nome. */
export async function findDuplicates(
  supabase: SupabaseClient, email: string | null | undefined, phone: string | null | undefined, excludeId?: string,
): Promise<DuplicateMatch[]> {
  const found = new Map<string, DuplicateMatch>();
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  const cols = "id,display_name,email,phone";
  if (e) {
    let q = supabase.from("contacts").select(cols).is("archived_at", null).eq("email_norm", e).limit(5);
    if (excludeId) q = q.neq("id", excludeId);
    (await q).data?.forEach((r) => found.set(r.id, r as DuplicateMatch));
  }
  if (p) {
    let q = supabase.from("contacts").select(cols).is("archived_at", null).eq("phone_norm", p).limit(5);
    if (excludeId) q = q.neq("id", excludeId);
    (await q).data?.forEach((r) => found.set(r.id, r as DuplicateMatch));
  }
  return [...found.values()];
}

export const errorState = (message?: string): ActionState => ({ error: message ?? t.common.genericError });
