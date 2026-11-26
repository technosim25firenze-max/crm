"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { MoneyVat } from "@/components/money-vat";
import { DEFAULT_VAT_RATE, splitStored } from "@/lib/money";
import { CompanyPicker } from "@/components/company-picker";
import { createOpportunity, listEventTypes, listStages, updateOpportunity } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";
import { humanizeKey } from "@/lib/format";
import { parseKind, type OppKind } from "@/lib/pipelines";
import type { ActionState } from "@/lib/actions/shared";

export interface OppDefaults {
  id: string; name: string; kind: OppKind; contact?: { id: string; name: string } | null; company_id: string | null;
  value_cents: number | null; vat_cents?: number | null; attendees: number | null; event_date: string | null; event_type: string | null;
}

const NEW = "__new__";

/** Tipo di evento: menu con i tipi già usati + possibilità di scriverne uno nuovo. Invia `event_type`. */
function EventTypeField({ initial, error }: { initial?: string | null; error?: string }) {
  const [types, setTypes] = useState<string[]>(initial ? [initial] : []);
  const [value, setValue] = useState(initial ?? "");
  const [custom, setCustom] = useState(false);
  useEffect(() => { listEventTypes().then((r) => setTypes([...new Set([...(initial ? [initial] : []), ...r])].sort((a, b) => a.localeCompare(b)))); }, [initial]);
  return (
    <Field label={t.sales.eventType} error={error}>
      {custom ? (
        <div className="flex gap-2">
          <Input name="event_type" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Es. Compleanno, Torneo…" autoFocus />
          <button type="button" onClick={() => { setCustom(false); setValue(initial ?? ""); }} className="shrink-0 text-xs text-muted hover:text-foreground">{t.common.cancel}</button>
        </div>
      ) : (
        <Select name="event_type" value={value} onChange={(e) => { if (e.target.value === NEW) { setValue(""); setCustom(true); } else setValue(e.target.value); }}>
          <option value="">—</option>
          {types.map((v) => <option key={v} value={v}>{humanizeKey(v) ?? v}</option>)}
          <option value={NEW}>{t.sales.newType}</option>
        </Select>
      )}
    </Field>
  );
}

/** Fase iniziale (solo in creazione): parte da "Da contattare", ma si può scegliere qualunque fase. Invia `stage_id`. */
function StageField({ kind }: { kind: OppKind }) {
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { listStages(kind).then(setStages); }, [kind]);
  if (!stages.length) return null;
  return (
    <Field label={t.sales.initialStage}>
      <Select key={kind} name="stage_id" defaultValue={stages[0].id}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
    </Field>
  );
}

function Form({ action, companies, def, preset, onDone, defaultKind = "event" }: {
  action: (p: ActionState | null, fd: FormData) => Promise<ActionState>; companies: { id: string; name: string }[]; def?: OppDefaults; preset?: { id: string; name: string } | null; onDone: () => void; defaultKind?: OppKind;
}) {
  const [state, formAction] = useActionState(action, null);
  const [kind, setKind] = useState<OppKind>(def?.kind ?? defaultKind);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <Field label={t.sales.kind}>
        <Select name="kind" value={kind} onChange={(e) => setKind(parseKind(e.target.value))}>
          {(Object.keys(t.sales.kinds) as OppKind[]).map((k) => <option key={k} value={k}>{t.sales.kinds[k]}</option>)}
        </Select>
      </Field>
      <Field label={t.sales.name} error={e.name}><Input name="name" defaultValue={def?.name} autoFocus required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.sales.contact}><ContactPicker initial={def?.contact ?? preset} allowCreate={!def} /></Field>
        <Field label={t.sales.company}><CompanyPicker initial={def?.company_id ? { id: def.company_id, name: companies.find((c) => c.id === def.company_id)?.name ?? "" } : null} /></Field>
        {!def && <StageField kind={kind} />}
        <MoneyVat key={kind} className="sm:col-span-2" rate={kind === "individual" ? 0 : DEFAULT_VAT_RATE} name="expected_value" label={t.sales.value}
          net={splitStored(def?.value_cents, def?.vat_cents).net} vat={splitStored(def?.value_cents, def?.vat_cents).vat} error={e.expected_value} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <EventTypeField initial={def?.event_type} error={e.event_type} />
        <Field label={t.sales.attendees} error={e.attendees}><Input name="attendees" inputMode="numeric" defaultValue={def?.attendees ?? ""} /></Field>
        <Field label={t.sales.eventDate} error={e.event_date}><Input name="event_date" type="date" defaultValue={def?.event_date ?? ""} /></Field>
      </div>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

export const NewOpportunityButton = ({ companies, preset, variant, kind }: { kind?: OppKind; companies: { id: string; name: string }[]; preset?: { id: string; name: string } | null; variant?: "primary" | "secondary" }) => (
  <Modal trigger={t.sales.newOpp} title={t.sales.newOpp} variant={variant}>
    {(close) => <Form action={createOpportunity} companies={companies} preset={preset} defaultKind={kind} onDone={close} />}
  </Modal>
);

export const EditOpportunityButton = ({ def, companies, menu }: { def: OppDefaults; companies: { id: string; name: string }[]; menu?: boolean }) => (
  <Modal trigger={t.common.edit} variant="secondary" title={t.common.edit} menu={menu}>
    {(close) => <Form action={updateOpportunity.bind(null, def.id)} companies={companies} def={def} onDone={close} />}
  </Modal>
);
