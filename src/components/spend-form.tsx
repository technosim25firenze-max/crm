"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addSpend } from "@/lib/actions/marketing";
import { toRomeLocalInput } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";

function Form({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(addSpend, null as ActionState | null);
  const [today] = useState(() => toRomeLocalInput().slice(0, 10));
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.analytics.platform}>
          <Select name="platform" defaultValue="meta">{Object.entries(t.analytics.platforms).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label={t.analytics.campaign}><Input name="campaign" /></Field>
        <Field label={t.analytics.periodStart} error={e.period_start}><Input name="period_start" type="date" defaultValue={today} required /></Field>
        <Field label={t.analytics.periodEnd} error={e.period_end}><Input name="period_end" type="date" defaultValue={today} required /></Field>
        <Field label={t.analytics.amount} error={e.amount}><Input name="amount" inputMode="decimal" placeholder="0,00" required autoFocus /></Field>
      </div>
      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={t.analytics.impressions} error={e.impressions}><Input name="impressions" inputMode="numeric" /></Field>
          <Field label={t.analytics.clicks} error={e.clicks}><Input name="clicks" inputMode="numeric" /></Field>
          <Field label={t.analytics.leadsField} error={e.leads}><Input name="leads" inputMode="numeric" /></Field>
        </div>
      </details>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

export const AddSpendButton = () => <Modal trigger={t.analytics.addSpend} title={t.analytics.addSpend}>{(close) => <Form onDone={close} />}</Modal>;
