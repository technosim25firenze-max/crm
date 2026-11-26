"use client";
import { useState, useTransition } from "react";
import Link from "@/components/nav-link";
import * as Dialog from "@radix-ui/react-dialog";
import { Badge, Button } from "@/components/ui";
import { CloseDealDialog } from "@/components/close-deal-dialog";
import { moveOpportunity } from "@/lib/actions/sales";
import { formatEuro } from "@/lib/format";
import { STALE_CARD, type Staleness } from "@/lib/staleness";
import { t } from "@/lib/i18n/it";

export interface KStage { id: string; name: string; kind: "open" | "won" | "lost" }
export interface KItem {
  id: string; name: string; menu?: React.ReactNode; stage_id: string; value_cents: number | null; vat_cents: number | null;
  collected_cents: number | null; event: string | null; stale: Staleness; overdue: boolean;
}

/** Bacheca unica: una colonna per fase. "Chiuso" chiede valore e primo incasso, "Perso" il motivo. */
export function Kanban({ stages, initial, canPay, individual = false }: { stages: KStage[]; initial: KItem[]; canPay: boolean; individual?: boolean }) {
  const [items, setItems] = useState(initial);
  // Dopo una creazione/modifica la pagina porta nuovi dati dal server: la bacheca li mostra subito senza ricaricare.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) { setSeen(initial); setItems(initial); }
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState<{ id: string; stage: string } | null>(null);
  const [closing, setClosing] = useState<{ id: string; stageId: string; name: string; totalCents: number | null; vatCents?: number | null; individual?: boolean; canPay: boolean } | null>(null);
  const [reason, setReason] = useState<string>(t.sales.lostReasons[0]);
  const [, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);

  function move(id: string, stageId: string, lostReason?: string) {
    const prev = items;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, stage_id: stageId } : i)));
    setError(null);
    start(async () => {
      const r = await moveOpportunity(id, stageId, lostReason);
      if (!r.ok) { setItems(prev); setError(r.error ?? t.common.genericError); }
    });
  }
  function requestMove(id: string, stageId: string) {
    const item = items.find((i) => i.id === id);
    if (!item || item.stage_id === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.kind === "lost") { setReason(t.sales.lostReasons[0]); setLost({ id, stage: stageId }); return; }
    // Con un valore già indicato si prenota subito (il valore resta); il popup si apre solo cliccando sui dati di pagamento della carta.
    if (stage?.kind === "won" && item.value_cents == null) { setClosing({ id, stageId, name: item.name, totalCents: item.value_cents, vatCents: item.vat_cents, individual, canPay }); return; }
    move(id, stageId);
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-brand">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((s) => {
          const col = items.filter((i) => i.stage_id === s.id);
          const total = col.reduce((a, i) => a + Math.max(0, (i.value_cents ?? 0) - (i.vat_cents ?? 0)), 0); // IVA esclusa
          return (
            <section key={s.id} aria-label={s.name}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); requestMove(e.dataTransfer.getData("text/plain"), s.id); }}
              className={`w-64 shrink-0 rounded-xl border bg-background p-2 transition-colors ${over === s.id ? "border-brand" : "border-border"}`}>
              <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h3 className="flex items-center gap-2 truncate text-[13px] font-semibold">
                  <span className={`h-2 w-2 rounded-full ${s.kind === "won" ? "bg-success" : s.kind === "lost" ? "bg-muted/50" : "bg-brand/70"}`} />{s.name}
                </h3>
                <span className="text-xs text-muted tabular-nums">{col.length}</span>
              </header>
              <p className="mb-2 px-1.5 text-xs text-muted">{total > 0 ? formatEuro(total) : " "}</p>
              <div className="min-h-12 space-y-2">
                {col.map((i) => (
                  <article key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                    className={`cursor-grab rounded-lg border p-3 text-sm shadow-sm active:cursor-grabbing ${i.stale ? STALE_CARD[i.stale] : "border-border bg-surface"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/sales/${i.id}`} className="font-medium leading-snug hover:underline">{i.name}</Link>
                      {i.menu}
                    </div>
                    {i.event && <p className="mt-0.5 truncate text-xs text-muted">{i.event}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        {i.overdue && <Badge tone="brand">{t.tasks.overdue}</Badge>}
                      </span>
                    </div>
                    {(() => {
                      const line = (
                        <>
                          {i.value_cents != null ? formatEuro(i.value_cents) : t.sales.cardNoValue}
                          {i.collected_cents != null && i.value_cents != null && i.value_cents > 0 && <> · <span className={i.collected_cents >= i.value_cents ? "text-success" : ""}>{formatEuro(i.collected_cents)} {t.sales.paid}</span></>}
                        </>
                      );
                      return s.kind === "won" ? (
                        <button type="button" onClick={() => setClosing({ id: i.id, stageId: s.id, name: i.name, totalCents: i.value_cents, vatCents: i.vat_cents, individual, canPay })}
                          className="-mx-1.5 mt-1.5 block rounded-md px-1.5 py-1 text-left text-xs text-muted underline-offset-2 hover:bg-background hover:text-foreground hover:underline">{line}</button>
                      ) : <p className="mt-2 text-xs text-muted">{line}</p>;
                    })()}
                    {/* Su tablet il trascinamento non è disponibile: selettore alternativo */}
                    <select aria-label={t.sales.move} value={i.stage_id} onChange={(e) => requestMove(i.id, e.target.value)}
                      className="mt-2 hidden h-8 w-full rounded-md border border-border bg-surface text-xs [@media(pointer:coarse)]:block">
                      {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <CloseDealDialog target={closing} onClose={() => setClosing(null)}
        onDone={(r) => {
          setItems((cur) => cur.map((i) => (i.id === r.id ? { ...i, stage_id: r.stageId, value_cents: r.totalCents, vat_cents: r.vatCents, collected_cents: canPay ? (i.collected_cents ?? 0) + r.collectedCents : null } : i)));
          setClosing(null);
        }} />

      <Dialog.Root open={!!lost} onOpenChange={(o) => !o && setLost(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">{t.sales.lostTitle}</Dialog.Title>
            <Dialog.Description className="sr-only">{t.sales.lostReason}</Dialog.Description>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-4 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm" aria-label={t.sales.lostReason}>
              {t.sales.lostReasons.map((r) => <option key={r}>{r}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLost(null)}>{t.common.cancel}</Button>
              <Button onClick={() => { if (lost) move(lost.id, lost.stage, reason); setLost(null); }}>{t.sales.markLost}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
