"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { createExpense, recordPayment, recordRefund } from "@/lib/actions/finance";
import { toRomeLocalInput } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";

export interface PaymentPreset { contact?: { id: string; name: string } | null; opportunity_id?: string; booking_id?: string; amount?: string }
const METHODS = ["cash", "card_pos", "bank_transfer", "gift_card", "other"] as const;

function PaymentForm({ preset, services, bookings, onDone }: {
  preset?: PaymentPreset; services: { id: string; name: string; vat_rate: number }[]; bookings: { id: string; label: string }[]; onDone: () => void;
}) {
  const [state, action] = useActionState(recordPayment, null as ActionState | null);
  const [vat, setVat] = useState("22");
  const [now] = useState(() => toRomeLocalInput());
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {preset?.opportunity_id && <input type="hidden" name="opportunity_id" value={preset.opportunity_id} />}
      {preset?.booking_id && <input type="hidden" name="booking_id" value={preset.booking_id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.finance.amount} error={e.amount}><Input name="amount" inputMode="decimal" placeholder="0,00" defaultValue={preset?.amount} autoFocus required /></Field>
        <Field label={t.finance.method}>
          <Select name="method" defaultValue="card_pos">{METHODS.map((m) => <option key={m} value={m}>{t.finance.methods[m]}</option>)}</Select>
        </Field>
        <Field label={t.finance.contact} className="sm:col-span-2"><ContactPicker initial={preset?.contact} /></Field>
        {!preset?.opportunity_id && !preset?.booking_id && bookings.length > 0 && (
          <Field label={t.finance.booking} className="sm:col-span-2">
            <Select name="booking_id" defaultValue={preset?.booking_id ?? ""}>
              <option value="">{t.common.none}</option>
              {bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t.finance.paidAt} error={e.paid_at}><Input name="paid_at" type="datetime-local" defaultValue={now} /></Field>
          <Field label={t.finance.vatRate} error={e.vat_rate}><Input name="vat_rate" inputMode="decimal" value={vat} onChange={(ev) => setVat(ev.target.value)} /></Field>
          <Field label={t.finance.service}>
            <Select name="service_id" defaultValue="" onChange={(ev) => { const s = services.find((x) => x.id === ev.target.value); if (s) setVat(String(s.vat_rate)); }}>
              <option value="">{t.common.none}</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label={t.finance.reference}><Input name="reference" /></Field>
          <Field label={t.finance.notes} className="sm:col-span-2"><Textarea name="notes" /></Field>
        </div>
      </details>
      <p className="text-xs text-muted">{t.finance.stripeNote}</p>
      {state?.warning && (
        <div className="rounded-lg border border-amber-300 bg-warning-soft p-3 text-sm">
          <p className="font-medium">{t.finance.duplicateTitle}</p><p className="mt-1 text-muted">{state.warning}</p>
          <input type="hidden" name="confirm" value="1" />
        </div>
      )}
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{state?.warning ? t.finance.registerAnyway : t.common.save}</SubmitButton></div>
    </form>
  );
}

export const RecordPaymentButton = ({ preset, services, bookings = [], variant = "primary", label }: {
  preset?: PaymentPreset; services: { id: string; name: string; vat_rate: number }[]; bookings?: { id: string; label: string }[]; variant?: "primary" | "secondary"; label?: string;
}) => (
  <Modal trigger={label ?? t.finance.recordPayment} title={t.finance.recordPayment} variant={variant}>
    {(close) => <PaymentForm preset={preset} services={services} bookings={bookings} onDone={close} />}
  </Modal>
);

function RefundForm({ paymentId, remaining, onDone }: { paymentId: string; remaining: string; onDone: () => void }) {
  const [state, action] = useActionState(recordRefund.bind(null, paymentId), null as ActionState | null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <Field label={t.finance.amount} error={state?.fieldErrors?.amount}><Input name="amount" inputMode="decimal" defaultValue={remaining} autoFocus required /></Field>
      <Field label={t.finance.notes}><Textarea name="notes" /></Field>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.finance.refund}</SubmitButton></div>
    </form>
  );
}

export const RefundButton = ({ paymentId, remaining }: { paymentId: string; remaining: string }) => (
  <Modal trigger={t.finance.refund} title={t.finance.refundTitle} description={t.finance.refundHint} variant="secondary" size="sm">
    {(close) => <RefundForm paymentId={paymentId} remaining={remaining} onDone={close} />}
  </Modal>
);

function ExpenseForm({ categories, onDone }: { categories: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action] = useActionState(createExpense, null as ActionState | null);
  const [today] = useState(() => toRomeLocalInput().slice(0, 10));
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.finance.supplier}><Input name="supplier" autoFocus /></Field>
        <Field label={t.finance.category}>
          <Select name="category_id" defaultValue="">
            <option value="">{t.finance.noCategory}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t.finance.netAmount} error={e.net}><Input name="net" inputMode="decimal" placeholder="0,00" required /></Field>
        <Field label={t.finance.vatAmount} error={e.vat}><Input name="vat" inputMode="decimal" placeholder="0,00" /></Field>
        <Field label={t.finance.date} error={e.spent_on}><Input name="spent_on" type="date" defaultValue={today} /></Field>
        <Field label={t.finance.status}>
          <Select name="payment_status" defaultValue="paid"><option value="paid">{t.finance.paid}</option><option value="unpaid">{t.finance.unpaid}</option></Select>
        </Field>
      </div>
      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3">
          <Field label={t.finance.description}><Input name="description" /></Field>
          <Field label={t.finance.document} error={e.document_url}><Input name="document_url" placeholder="https://" /></Field>
          <Field label={t.finance.method}>
            <Select name="method" defaultValue=""><option value="">—</option>
              {(["cash", "card_pos", "bank_transfer", "other"] as const).map((m) => <option key={m} value={m}>{t.finance.methods[m]}</option>)}</Select>
          </Field>
        </div>
      </details>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

export const NewExpenseButton = ({ categories }: { categories: { id: string; name: string }[] }) => (
  <Modal trigger={t.finance.newExpense} title={t.finance.newExpense}>{(close) => <ExpenseForm categories={categories} onDone={close} />}</Modal>
);
