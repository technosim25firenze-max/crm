"use client";
import { useActionState, useEffect } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { createOpportunity, updateOpportunity } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";

export interface OppDefaults {
  id: string; name: string; kind: "individual" | "event"; contact?: { id: string; name: string } | null; company_id: string | null;
  expected_value_cents: number | null; agreed_value_cents: number | null; probability: number | null; attendees: number | null;
  expected_close_date: string | null; event_date: string | null; event_type: string | null; closed: boolean;
}
const euro = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

function Form({ action, companies, kind, def, preset, onDone }: {
  action: (p: ActionState | null, fd: FormData) => Promise<ActionState>; companies: { id: string; name: string }[]; kind: "individual" | "event"; def?: OppDefaults; preset?: { id: string; name: string } | null; onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <Field label={t.sales.kind}>
        <Select name="kind" defaultValue={def?.kind ?? kind}>
          {Object.entries(t.sales.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label={t.sales.name} error={e.name}><Input name="name" defaultValue={def?.name} autoFocus required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.sales.contact}><ContactPicker initial={def?.contact ?? preset} allowCreate={!def} /></Field>
        <Field label={t.sales.company}>
          <Select name="company_id" defaultValue={def?.company_id ?? ""}>
            <option value="">{t.common.none}</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t.sales.value} error={e.expected_value}><Input name="expected_value" inputMode="decimal" placeholder="0,00" defaultValue={euro(def?.expected_value_cents)} /></Field>
        {def?.closed && <Field label={t.sales.agreed} error={e.agreed_value}><Input name="agreed_value" inputMode="decimal" defaultValue={euro(def?.agreed_value_cents)} /></Field>}
      </div>
      <details className="rounded-lg border border-border px-3 py-2" open={!!def}>
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t.sales.eventType} error={e.event_type}><Input name="event_type" defaultValue={def?.event_type ?? ""} placeholder="Team building, compleanno, torneo…" /></Field>
          <Field label={t.sales.attendees} error={e.attendees}><Input name="attendees" inputMode="numeric" defaultValue={def?.attendees ?? ""} /></Field>
          <Field label={t.sales.eventDate} error={e.event_date}><Input name="event_date" type="date" defaultValue={def?.event_date ?? ""} /></Field>
          <Field label={t.sales.closeDate} error={e.expected_close_date}><Input name="expected_close_date" type="date" defaultValue={def?.expected_close_date ?? ""} /></Field>
          <Field label={t.sales.probability} error={e.probability}><Input name="probability" inputMode="numeric" defaultValue={def?.probability ?? ""} /></Field>
        </div>
      </details>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

export const NewOpportunityButton = ({ kind = "event", companies, preset, variant }: { kind?: "individual" | "event"; companies: { id: string; name: string }[]; preset?: { id: string; name: string } | null; variant?: "primary" | "secondary" }) => (
  <Modal trigger={t.sales.newOpp} title={t.sales.newOpp} variant={variant}>
    {(close) => <Form action={createOpportunity} companies={companies} kind={kind} preset={preset} onDone={close} />}
  </Modal>
);

export const EditOpportunityButton = ({ def, companies }: { def: OppDefaults; companies: { id: string; name: string }[] }) => (
  <Modal trigger={t.common.edit} variant="secondary" title={t.common.edit}>
    {(close) => <Form action={updateOpportunity.bind(null, def.id)} companies={companies} kind={def.kind} def={def} onDone={close} />}
  </Modal>
);
