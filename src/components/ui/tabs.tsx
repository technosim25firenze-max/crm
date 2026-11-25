"use client";
import NavLink from "@/components/nav-link";
import { useNav } from "@/components/nav-provider";
import { cn } from "@/lib/utils";

/** Schede: la scheda cliccata diventa attiva subito, prima che arrivi la nuova pagina. */
export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  const target = useNav()?.target;
  return (
    <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Schede">
      {items.map((i) => {
        const active = target && items.some((x) => x.href === target) ? i.href === target : i.active;
        return (
          <NavLink key={i.href} href={i.href}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground")}>
            {i.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
