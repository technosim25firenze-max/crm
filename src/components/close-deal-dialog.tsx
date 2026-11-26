"use client";
import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { MoneyVat } from "@/components/money-vat";
import { DEFAULT_VAT_RATE, splitStored } from "@/lib/money";
import { closeOpportunity } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

/** Chiusura di una scheda come vinta: valore totale + primo incasso (importo e data). */
export function CloseDealDialog({ target, onClose, onDone }: {
  target: { id: string; stageId: string; name: string; totalCents: number | null; vatCents?: number | null; individual?: boolean; canPay: boolean } | null;
  onClose: () => void;
  onDone: (r: { id: string; stageId: string; totalCents: number; vatCents: number; collectedCents: number }) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit(fd: FormData) {
    if (!target) return;
    start(async () => {
      const r = await closeOpportunity(target.id, target.stageId, fd);
      if (r.ok) { setErrors({}); setError(null); onDone({ id: target.id, stageId: target.stageId, totalCents: r.totalCents ?? 0, vatCents: r.vatCents ?? 0, collectedCents: r.collectedCents ?? 0 }); return; }
      setErrors(r.fieldErrors ?? {}); setError(r.error ?? null);
    });
  }

  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => { if (!o) { setErrors({}); setError(null); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] [animation:fade-in_var(--duration)_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-modal border border-border bg-surface p-7 shadow-pop [animation:pop-in_220ms_var(--ease-out)]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">{t.sales.closeTitle}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">{target?.name} · {target?.canPay ? t.sales.closeBody : t.sales.closeBodyNoPay}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t.common.close} className="rounded-md p-1 text-muted hover:bg-background"><X size={18} /></Dialog.Close>
          </div>
          {target && (
            <form action={submit} key={target.id} className="space-y-4">
              <MoneyVat rate={target.individual ? 0 : DEFAULT_VAT_RATE} name="total" label={t.sales.closeTotal.replace(" (€)", "")} net={splitStored(target.totalCents, target.vatCents).net} vat={splitStored(target.totalCents, target.vatCents).vat} error={errors.total} required autoFocus />
              {target.canPay && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MoneyVat rate={target.individual ? 0 : DEFAULT_VAT_RATE} className="sm:col-span-2" name="collected" label={t.sales.closeCollected.replace(" (€)", "")} error={errors.collected} />
                  <Field label={t.sales.closePaidOn} error={errors.paid_on}><Input name="paid_on" type="date" defaultValue={today()} /></Field>
                  <Field label={t.sales.closeMethod} className="sm:col-span-2">
                    <Select name="method" defaultValue="bank_transfer">
                      {Object.entries(t.finance.methods).filter(([k]) => k !== "stripe").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
              {error && <p role="alert" className="text-sm text-brand">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
                <Button type="submit" disabled={busy}>{t.sales.closeConfirm}</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
