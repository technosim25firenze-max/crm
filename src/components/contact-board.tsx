"use client";
import { useState, useTransition } from "react";
import Link from "@/components/nav-link";
import { setContactLifecycle } from "@/lib/actions/contacts";
import { STALE_CARD, type Staleness } from "@/lib/staleness";
import { t } from "@/lib/i18n/it";
import { cn } from "@/lib/utils";

export interface BoardContact { id: string; name: string; sub: string | null; lifecycle: string; stale: Staleness }
const COLUMNS = Object.keys(t.lifecycle) as (keyof typeof t.lifecycle)[];

/** Bacheca persone: una colonna per stato; trascina le schede per cambiare stato. Giallo dopo 72 ore, rosso dopo 7 giorni senza contatto. */
export function ContactBoard({ initial }: { initial: BoardContact[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();

  function move(id: string, lifecycle: string) {
    const prev = items;
    if (prev.find((i) => i.id === id)?.lifecycle === lifecycle) return;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, lifecycle } : i)));
    setError(null);
    start(async () => {
      const r = await setContactLifecycle(id, lifecycle);
      if (!r.ok) { setItems(prev); setError(r.error ?? t.common.genericError); }
    });
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-brand">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((s) => {
          const col = items.filter((i) => i.lifecycle === s);
          return (
            <section key={s} aria-label={t.lifecycle[s]}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("text/plain"), s); }}
              className={cn("w-64 shrink-0 rounded-card border bg-background p-2 transition-colors", over === s ? "border-brand" : "border-border")}>
              <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h3 className="truncate text-[13px] font-semibold">{t.lifecycle[s]}</h3>
                <span className="text-xs text-muted tabular-nums">{col.length}</span>
              </header>
              <div className="min-h-12 space-y-2">
                {col.map((i) => (
                  <article key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                    className={cn("cursor-grab rounded-control border p-3 text-sm shadow-card active:cursor-grabbing", i.stale ? STALE_CARD[i.stale] : "border-border bg-surface")}>
                    <Link href={`/contacts/${i.id}`} className="font-medium leading-snug hover:underline">{i.name}</Link>
                    {i.sub && <p className="mt-0.5 truncate text-xs text-muted">{i.sub}</p>}
                    <select aria-label={t.sales.move} value={i.lifecycle} onChange={(e) => move(i.id, e.target.value)}
                      className="mt-2 hidden h-8 w-full rounded-control border border-border bg-surface px-2 text-xs [@media(pointer:coarse)]:block">
                      {COLUMNS.map((k) => <option key={k} value={k}>{t.lifecycle[k]}</option>)}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
