"use client";
import { useState, useTransition } from "react";
import Link from "@/components/nav-link";
import { moveLead } from "@/lib/actions/leads";
import { LEAD_STAGES, type LeadStage } from "@/lib/leads";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import { cn } from "@/lib/utils";

export interface LeadItem { id: string; name: string; sub: string | null; stage: LeadStage; created_at: string }

/** Bacheca lead: trascina le schede tra le fasi (su touch usa il menu della scheda). */
export function LeadBoard({ initial }: { initial: LeadItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [, start] = useTransition();

  function move(id: string, stage: LeadStage) {
    const prev = items;
    if (prev.find((i) => i.id === id)?.stage === stage) return;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, stage } : i)));
    setError(null);
    start(async () => {
      const r = await moveLead(id, stage);
      if (!r.ok) { setItems(prev); setError(r.error ?? t.common.genericError); }
    });
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-brand">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {LEAD_STAGES.map((s) => {
          const col = items.filter((i) => i.stage === s);
          return (
            <section key={s} aria-label={t.leads.stages[s]}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("text/plain"), s); }}
              className={cn("w-64 shrink-0 rounded-card border bg-background p-2 transition-colors", over === s ? "border-brand" : "border-border")}>
              <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h3 className="flex items-center gap-2 truncate text-[13px] font-semibold">
                  <span className={cn("h-2 w-2 rounded-full", s === "closed" ? "bg-success" : s === "lost" ? "bg-muted/50" : "bg-brand/70")} />
                  {t.leads.stages[s]}
                </h3>
                <span className="text-xs text-muted tabular-nums">{col.length}</span>
              </header>
              <div className="min-h-12 space-y-2">
                {col.map((i) => (
                  <article key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                    className="cursor-grab rounded-control border border-border bg-surface p-3 text-sm shadow-card transition-shadow hover:shadow-pop active:cursor-grabbing">
                    <Link href={`/contacts/${i.id}`} className="font-medium leading-snug hover:underline">{i.name}</Link>
                    {i.sub && <p className="mt-0.5 truncate text-xs text-muted">{i.sub}</p>}
                    <p className="mt-2 text-xs text-muted">{formatDate(i.created_at)}</p>
                    <select aria-label={t.leads.move} value={i.stage} onChange={(e) => move(i.id, e.target.value as LeadStage)}
                      className="mt-2 hidden h-8 w-full rounded-control border border-border bg-surface px-2 text-xs [@media(pointer:coarse)]:block">
                      {LEAD_STAGES.map((st) => <option key={st} value={st}>{t.leads.stages[st]}</option>)}
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
