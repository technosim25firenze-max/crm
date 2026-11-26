"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui";
import { searchEntities } from "@/lib/actions/search";
import { t } from "@/lib/i18n/it";

type Hit = { id: string; name: string; sub: string };

/** Selettore azienda: elenco al clic, ricerca scrivendo, e "Crea nuova azienda" al volo. Invia `company_id` oppure `new_company_name`. */
export function CompanyPicker({ initial, allowCreate = true, required = false, name = "company_id" }: {
  initial?: { id: string; name: string } | null; allowCreate?: boolean; required?: boolean; name?: string;
}) {
  const [selected, setSelected] = useState(initial ?? null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const h = setTimeout(async () => { const r = await searchEntities("companies", q); if (mine === seq.current) { setHits(r); setSearched(true); } }, q.trim() ? 250 : 0);
    return () => clearTimeout(h);
  }, [q, open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (selected) {
    return (
      <div className="flex h-10 items-center justify-between rounded-control border border-border bg-surface px-3 text-sm">
        <input type="hidden" name={name} value={selected.id} />
        <span className="truncate font-medium">{selected.name}</span>
        <button type="button" aria-label={t.common.remove} onClick={() => setSelected(null)} className="text-muted hover:text-brand"><X size={14} /></button>
      </div>
    );
  }
  if (creating) {
    return (
      <div className="space-y-1.5 rounded-control border border-border bg-background p-3">
        <div className="flex items-center justify-between"><p className="text-[13px] font-medium">{t.contacts.newCompany}</p>
          <button type="button" onClick={() => setCreating(false)} className="text-xs text-muted hover:text-foreground">{t.contacts.searchExistingCompany}</button></div>
        <Input name="new_company_name" placeholder={t.company.name} aria-label={t.company.name} autoFocus required={required} />
        <p className="text-xs text-muted">{t.company.newInlineHint}</p>
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <Input value={q} onChange={(e) => { setQ(e.target.value); setSearched(false); }} onFocus={() => setOpen(true)} placeholder={t.company.searchPicker} autoComplete="off" aria-label={t.contacts.company} />
      {open && (hits.length > 0 || searched) && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-control border border-border bg-surface shadow-pop">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => { setSelected({ id: h.id, name: h.name }); setQ(""); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-background">
                <span className="font-medium">{h.name}</span>{h.sub && <span className="block text-xs text-muted">{h.sub}</span>}
              </button>
            </li>
          ))}
          {searched && hits.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t.company.noResults}</li>}
          {allowCreate && (
            <li className="border-t border-border">
              <button type="button" onClick={() => { setCreating(true); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-background"><Plus size={14} />{t.contacts.newCompany}</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
