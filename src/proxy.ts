import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Aggiorna la sessione e reindirizza gli utenti non autenticati. L'autorizzazione reale è nelle pagine/azioni e nella RLS. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/login";
  // /set-password riceve la sessione dall'invito nel frammento dell'URL (lato browser).
  if (request.nextUrl.pathname === "/set-password") return response;
  // I webhook dei sistemi esterni si autenticano con firma HMAC, non con la sessione utente.
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) return response;

  if (!data.user && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (data.user && isLogin) return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
