"use client";
import { useActionState, useEffect } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createService } from "@/lib/actions/config";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";

function Form({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createService, null as ActionState | null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label={t.config.serviceName} error={e.name}><Input name="name" required autoFocus /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.config.serviceCategory}><Input name="category" /></Field>
        <Field label={t.config.servicePrice} error={e.price}><Input name="price" inputMode="decimal" placeholder="0,00" /></Field>
        <Field label={t.config.serviceVat} error={e.vat_rate}><Input name="vat_rate" inputMode="decimal" defaultValue="22" /></Field>
        <Field label={t.config.serviceDuration} error={e.duration}><Input name="duration" inputMode="numeric" /></Field>
      </div>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}
export const NewServiceButton = () => <Modal trigger={t.config.newService} title={t.config.newService}>{(close) => <Form onDone={close} />}</Modal>;
