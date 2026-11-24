import type { SupabaseClient } from "@supabase/supabase-js";

/** Mappa id → nome visualizzato del team (poche persone). */
export async function loadPeople(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("profiles").select("id,full_name,email");
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name || p.email]));
}

export async function signDocuments(supabase: SupabaseClient, docs: { id: string; storage_path: string | null }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(docs.filter((d) => d.storage_path).map(async (d) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path!, 300);
    if (data?.signedUrl) out[d.id] = data.signedUrl;
  }));
  return out;
}
