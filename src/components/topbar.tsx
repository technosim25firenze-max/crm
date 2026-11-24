import { Search } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { t } from "@/lib/i18n/it";
import type { Role } from "@/lib/permissions";

export function Topbar({ name, role }: { name: string; role: Role }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 backdrop-blur-md md:px-8">
      <form action="/contacts" role="search" className="relative w-full max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input name="q" placeholder={t.common.searchGlobal} aria-label={t.common.search}
          className="h-10 w-full rounded-control border border-transparent bg-background pl-9 pr-3 text-sm transition-[border-color,background-color] placeholder:text-muted/70 focus:border-border focus:bg-surface focus:outline-none" />
      </form>
      <div className="flex items-center gap-3 text-sm">
        <div className="hidden text-right leading-tight sm:block">
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted">{t.roles[role]}</p>
        </div>
        <form action={signOut}><button className="rounded-control px-2.5 py-1.5 text-muted transition-colors hover:bg-background hover:text-foreground">{t.common.signOut}</button></form>
      </div>
    </header>
  );
}
