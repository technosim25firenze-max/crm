"use client";
import { useActionState, useEffect } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { createTask } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";

type Link = { contact_id?: string; company_id?: string; opportunity_id?: string };

function Form({ revalidate, link, team, me, onDone }: { revalidate: string; link?: Link; team: { id: string; name: string }[]; me: string; onDone: () => void }) {
  const [state, action] = useActionState(createTask.bind(null, revalidate), null as ActionState | null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {link?.contact_id && <input type="hidden" name="contact_id" value={link.contact_id} />}
      {link?.company_id && <input type="hidden" name="company_id" value={link.company_id} />}
      {link?.opportunity_id && <input type="hidden" name="opportunity_id" value={link.opportunity_id} />}
      <Field label={t.tasks.titleField} error={e.title}><Input name="title" autoFocus required placeholder="Es. Richiamare per il preventivo" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.tasks.due} error={e.due_date}><Input name="due_date" type="date" /></Field>
        <Field label={t.tasks.priority}>
          <Select name="priority" defaultValue="normal">{Object.entries(t.tasks.priorities).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label={t.tasks.assignee}>
          <Select name="assigned_to" defaultValue={me}>{team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        {!link && <Field label={t.tasks.link}><ContactPicker /></Field>}
      </div>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

export const NewTaskButton = ({ revalidate, link, team, me, label, variant = "primary" }: {
  revalidate: string; link?: Link; team: { id: string; name: string }[]; me: string; label?: string; variant?: "primary" | "secondary";
}) => (
  <Modal trigger={label ?? t.tasks.new} title={t.tasks.new} variant={variant}>
    {(close) => <Form revalidate={revalidate} link={link} team={team} me={me} onDone={close} />}
  </Modal>
);
