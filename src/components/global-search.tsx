"use client";
import { Search } from "lucide-react";
import { useNav } from "@/components/nav-provider";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/it";

/** Ricerca nella barra superiore: naviga lato client invece di ricaricare l'intera pagina. */
export function GlobalSearch() {
  const nav = useNav();
  const router = useRouter();
  return (
    <form action="/contacts" role="search" className="relative w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        const href = q ? `/contacts?${new URLSearchParams({ q })}` : "/contacts";
        if (nav) nav.go(href); else router.push(href);
      }}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input name="q" placeholder={t.common.searchGlobal} aria-label={t.common.search}
        className="h-10 w-full rounded-control border border-transparent bg-background pl-9 pr-3 text-sm transition-[border-color,background-color] placeholder:text-muted/70 focus:border-border focus:bg-surface focus:outline-none" />
    </form>
  );
}
