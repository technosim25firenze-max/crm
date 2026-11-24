import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Client con la sessione dell'utente: le policy RLS del database restano l'autorità. */
export async function createClient() {
  const store = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Chiamato da un Server Component: il refresh della sessione avviene nel proxy.
        }
      },
    },
  });
}
