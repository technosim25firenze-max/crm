import type { SupabaseClient } from "@supabase/supabase-js";

/** Cataloghi per il form prenotazione: servizi attivi e nomi di simulatori già usati. */
export async function loadBookingFormData(supabase: SupabaseClient) {
  const [{ data: services }, { data: res }] = await Promise.all([
    supabase.from("services").select("id,name,duration_minutes,default_price_cents").eq("active", true).order("name"),
    supabase.from("bookings").select("resource_name").not("resource_name", "is", null).order("starts_at", { ascending: false }).limit(300),
  ]);
  const resources = [...new Set((res ?? []).map((r) => r.resource_name as string))].sort();
  return { services: services ?? [], resources };
}
