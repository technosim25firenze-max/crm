"use client";
import { usePathname, useRouter } from "next/navigation";
import { useNav } from "@/components/nav-provider";
import { SearchCombo } from "@/components/search-combo";
import type { SearchScope } from "@/lib/actions/search";

const scopeOf = (path: string): SearchScope =>
  path.startsWith("/companies") ? "companies" : path.startsWith("/sales") ? "sales" : path.startsWith("/bookings") ? "bookings" : "contacts";
const listOf: Record<SearchScope, string> = { contacts: "/contacts", companies: "/companies", sales: "/sales", bookings: "/bookings" };

/** Ricerca nella barra superiore: cerca tra gli elementi della pagina corrente (contatti, aziende, eventi, prenotazioni). */
export function GlobalSearch() {
  const nav = useNav();
  const router = useRouter();
  const scope = scopeOf(usePathname());
  return (
    <form action={listOf[scope]} role="search" className="w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (scope === "sales" || scope === "bookings") return; // qui si sceglie un elemento dal menu
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        const href = q ? `${listOf[scope]}?${new URLSearchParams({ q })}` : listOf[scope];
        if (nav) nav.go(href); else router.push(href);
      }}>
      <SearchCombo key={scope} scope={scope} icon
        inputClassName="h-10 w-full rounded-control border border-transparent bg-background pl-9 pr-3 text-sm transition-[border-color,background-color] placeholder:text-muted/70 focus:border-border focus:bg-surface focus:outline-none" />
    </form>
  );
}
