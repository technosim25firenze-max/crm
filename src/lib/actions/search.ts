"use server";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch } from "@/lib/search";
import { normalizePhone } from "@/lib/phone";
import { dealTitle, formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export type SearchScope = "contacts" | "companies" | "sales" | "bookings";
export interface SearchHit { id: string; name: string; sub: string; href: string }

/** Elementi della pagina in cui ci si trova: senza testo un elenco iniziale, con testo i risultati filtrati. */
export async function searchEntities(scope: SearchScope, q: string): Promise<SearchHit[]> {
  const term = cleanSearch(q);
  const has = term.length >= 2;
  const supabase = await createClient();

  if (scope === "companies") {
    let query = supabase.from("companies").select("id,name,industry,city").is("archived_at", null).order("name").limit(has ? 20 : 50);
    if (has) query = query.ilike("name", `%${term}%`);
    const { data } = await query;
    return (data ?? []).map((c) => ({ id: c.id, name: c.name, sub: [c.industry, c.city].filter(Boolean).join(" · "), href: `/companies/${c.id}` }));
  }
  if (scope === "sales") {
    let query = supabase.from("opportunities").select("id,name,event_type,contacts(display_name),companies(name),pipeline_stages(name)").order("created_at", { ascending: false }).limit(has ? 20 : 50);
    if (has) query = query.ilike("name", `%${term}%`);
    const { data } = await query;
    return (data ?? []).map((o) => {
      const c = o.contacts as unknown as { display_name: string } | null, co = o.companies as unknown as { name: string } | null, st = o.pipeline_stages as unknown as { name: string } | null;
      return { id: o.id, name: dealTitle(co?.name, c?.display_name, o.name), sub: st?.name ?? "", href: `/sales/${o.id}` };
    });
  }
  if (scope === "bookings") {
    let query = supabase.from("bookings").select("id,customer_name,service_name,starts_at").eq("is_test", false).order("starts_at", { ascending: false }).limit(has ? 20 : 50);
    if (has) query = query.or(`customer_name.ilike.%${term}%,customer_email.ilike.%${term}%,service_name.ilike.%${term}%`);
    const { data } = await query;
    return (data ?? []).map((b) => ({ id: b.id, name: b.customer_name ?? t.bookingsPage.title, sub: [b.service_name, formatDateTime(b.starts_at)].filter(Boolean).join(" · "), href: `/bookings/${b.id}` }));
  }
  let query = supabase.from("contacts").select("id,display_name,email,phone").is("archived_at", null).order("display_name").limit(has ? 20 : 50);
  if (has) {
    const parts = [`display_name.ilike.%${term}%`, `email.ilike.%${term}%`];
    const digits = normalizePhone(term);
    if (digits && digits.length >= 3) parts.push(`phone_norm.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  const { data } = await query;
  return (data ?? []).map((c) => ({ id: c.id, name: c.display_name ?? t.contacts.noName, sub: [c.email, c.phone].filter(Boolean).join(" · "), href: `/contacts/${c.id}` }));
}
