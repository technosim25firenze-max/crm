"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui";
import { searchContacts } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";

type Hit = { id: string; name: string; sub: string };
export interface NewContactSeed { first_name?: string; last_name?: string; email?: string; phone?: string }

/**
 * Selettore contatto: cerca per nome, email o telefono; con `suggest` parte già con una ricerca (es. i dati della prenotazione);
 * con `allowCreate` permette di creare un nuovo contatto al volo (campi `new_*`). Invia `contact_id` oppure `new_*`.
 */
export function ContactPicker({ name = "contact_id", initial, placeholder, suggest, allowCreate = false, seed }: {
  name?: string; initial?: { id: string; name: string } | null; placeholder?: string; suggest?: string; allowCreate?: boolean; seed?: NewContactSeed;
}) {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(initial ?? null);
  const [q, setQ] = useState(suggest ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const mine = ++seq.current;
    const h = setTimeout(async () => {
      const r = await searchContacts(q);
      if (mine === seq.current) { setHits(r); setSearched(true); }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  if (selected) {
    return (
      <div className="flex h-9 items-center justify-between rounded-lg border border-border bg-surface px-3 text-sm">
        <input type="hidden" name={name} value={selected.id} />
        <span className="truncate font-medium">{selected.name}</span>
        <button type="button" aria-label={t.common.remove} onClick={() => setSelected(null)} className="text-muted hover:text-brand"><X size={14} /></button>
      </div>
    );
  }
  if (creating) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between"><p className="text-[13px] font-medium">{t.contacts.new}</p>
          <button type="button" onClick={() => setCreating(false)} className="text-xs text-muted hover:text-foreground">{t.contacts.searchExisting}</button></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="new_first_name" placeholder={t.contacts.firstName} defaultValue={seed?.first_name} aria-label={t.contacts.firstName} autoFocus />
          <Input name="new_last_name" placeholder={t.contacts.lastName} defaultValue={seed?.last_name} aria-label={t.contacts.lastName} />
          <Input name="new_email" type="email" placeholder={t.contacts.email} defaultValue={seed?.email} aria-label={t.contacts.email} />
          <Input name="new_phone" type="tel" placeholder={t.contacts.phone} defaultValue={seed?.phone} aria-label={t.contacts.phone} />
        </div>
        <p className="text-xs text-muted">{t.contacts.newInlineHint}</p>
      </div>
    );
  }
  const showList = q.trim().length >= 2 && (hits.length > 0 || (searched && allowCreate));
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => { setQ(e.target.value); setSearched(false); }} placeholder={placeholder ?? t.contacts.searchPicker} autoComplete="off" aria-label={t.sales.contact} />
      {showList && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => { setSelected({ id: h.id, name: h.name }); setQ(""); setHits([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-background">
                <span className="font-medium">{h.name}</span>{h.sub && <span className="block text-xs text-muted">{h.sub}</span>}
              </button>
            </li>
          ))}
          {searched && hits.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t.contacts.noResults}</li>}
          {allowCreate && (
            <li className="border-t border-border">
              <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-background"><Plus size={14} />{t.contacts.createNew}</button>
            </li>
          )}
        </ul>
      )}
      {allowCreate && !showList && (
        <button type="button" onClick={() => setCreating(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><Plus size={12} />{t.contacts.createNew}</button>
      )}
    </div>
  );
}
