"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useNav } from "@/components/nav-provider";
import { searchEntities, type SearchHit, type SearchScope } from "@/lib/actions/search";
import { t } from "@/lib/i18n/it";

export const SCOPE_PLACEHOLDER: Record<SearchScope, string> = {
  contacts: "Cerca un contatto…", companies: "Cerca un'azienda…", sales: "Cerca un evento…", bookings: "Cerca una prenotazione…",
};

/** Campo di ricerca con menu: al clic mostra gli elementi della pagina, scrivendo li filtra; un clic su un elemento lo apre. Invia `name` (default "q") nel form che lo contiene. */
export function SearchCombo({ scope, name = "q", defaultValue = "", placeholder, className = "", icon = false, inputClassName = "" }: {
  scope: SearchScope; name?: string; defaultValue?: string; placeholder?: string; className?: string; icon?: boolean; inputClassName?: string;
}) {
  const nav = useNav();
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const h = setTimeout(async () => { const r = await searchEntities(scope, q); if (mine === seq.current) setHits(r); }, q.trim() ? 250 : 0);
    return () => clearTimeout(h);
  }, [q, open, scope]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const go = (href: string) => { setOpen(false); if (nav) nav.go(href); else router.push(href); };
  return (
    <div ref={box} className={`relative ${className}`}>
      {icon && <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />}
      <input name={name} value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        placeholder={placeholder ?? SCOPE_PLACEHOLDER[scope]} aria-label={t.common.search} className={inputClassName} />
      {open && hits.length > 0 && (
        <ul className="absolute left-0 top-full z-40 mt-1.5 max-h-80 w-full min-w-64 overflow-auto rounded-card border border-border bg-surface p-1 shadow-pop">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => go(h.href)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background">
                <span className="font-medium">{h.name}</span>{h.sub && <span className="block truncate text-xs text-muted">{h.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
