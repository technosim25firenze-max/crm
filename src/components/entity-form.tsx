"use client";
import { useActionState, useEffect } from "react";
import Link from "next/link";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";
import type { Company, Contact } from "@/lib/types";

type Action = (prev: ActionState | null, fd: FormData) => Promise<ActionState>;

function Errors({ state }: { state: ActionState | null }) {
  return state?.error ? <p role="alert" className="text-sm text-brand">{state.error}</p> : null;
}

/** Form contatto per creazione e modifica. I campi avanzati sono in una sezione espandibile. */
export function ContactForm({ action, contact, onDone }: { action: Action; contact?: Contact; onDone?: () => void }) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => { if (state?.ok) onDone?.(); }, [state, onDone]);
  const err = state?.fieldErrors ?? {};
  const v = (k: keyof Contact) => (contact?.[k] as string | null | undefined) ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.contacts.firstName} error={err.first_name}><Input name="first_name" defaultValue={v("first_name")} autoFocus /></Field>
        <Field label={t.contacts.lastName} error={err.last_name}><Input name="last_name" defaultValue={v("last_name")} /></Field>
        <Field label={t.contacts.email} error={err.email}><Input name="email" type="email" defaultValue={v("email")} /></Field>
        <Field label={t.contacts.phone} error={err.phone}><Input name="phone" type="tel" defaultValue={v("phone")} /></Field>
        <Field label={t.contacts.kind}>
          <Select name="kind" defaultValue={contact?.kind ?? "b2c"}>
            {Object.entries(t.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label={t.contacts.city} error={err.city}><Input name="city" defaultValue={v("city")} /></Field>
      </div>

      <details className="rounded-control border border-border px-3 py-2" open={!!contact}>
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t.contacts.lifecycle}>
            <Select name="lifecycle" defaultValue={contact?.lifecycle ?? "prospect"}>
              {Object.entries(t.lifecycle).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label={t.contacts.source}>
            <Select name="source" defaultValue={contact?.source ?? "manual"}>
              {Object.entries(t.sources).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label={t.contacts.sourceDetail} className="sm:col-span-2"><Input name="source_detail" defaultValue={v("source_detail")} /></Field>
          <Field label={t.contacts.jobTitle}><Input name="job_title" defaultValue={v("job_title")} /></Field>
          <Field label={t.contacts.country}><Input name="country" defaultValue={v("country")} /></Field>
          <Field label={t.contacts.preferredChannel}>
            <Select name="preferred_channel" defaultValue={v("preferred_channel")}>
              <option value="">—</option>
              {Object.entries(t.channels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label={t.contacts.simPreferences} className="sm:col-span-2"><Textarea name="sim_preferences" defaultValue={v("sim_preferences")} /></Field>
        </div>
      </details>

      {state?.duplicates && (
        <div className="rounded-control border border-amber-300 bg-warning-soft p-3 text-sm">
          <p className="font-medium">{t.contacts.duplicateTitle}</p>
          <p className="mt-1 text-muted">{t.contacts.duplicateBody}</p>
          <ul className="mt-2 space-y-1">
            {state.duplicates.map((d) => (
              <li key={d.id}><Link className="font-medium underline" href={`/contacts/${d.id}`} target="_blank">{d.display_name}</Link>
                <span className="text-muted"> {[d.email, d.phone].filter(Boolean).join(" · ")}</span></li>
            ))}
          </ul>
          <input type="hidden" name="confirm" value="1" />
        </div>
      )}
      <Errors state={state} />
      <div className="flex justify-end gap-2">
        <SubmitButton>{state?.duplicates ? t.contacts.createAnyway : t.common.save}</SubmitButton>
      </div>
    </form>
  );
}

export function CompanyForm({ action, company, onDone }: { action: Action; company?: Company; onDone?: () => void }) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => { if (state?.ok) onDone?.(); }, [state, onDone]);
  const err = state?.fieldErrors ?? {};
  const v = (k: keyof Company) => (company?.[k] as string | null | undefined) ?? "";
  return (
    <form action={formAction} className="space-y-4">
      <Field label={t.company.name} error={err.name}><Input name="name" defaultValue={v("name")} autoFocus /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.company.email} error={err.email}><Input name="email" type="email" defaultValue={v("email")} /></Field>
        <Field label={t.company.phone}><Input name="phone" type="tel" defaultValue={v("phone")} /></Field>
        <Field label={t.company.city}><Input name="city" defaultValue={v("city")} /></Field>
        <Field label={t.company.industry}><Input name="industry" defaultValue={v("industry")} /></Field>
      </div>
      <details className="rounded-control border border-border px-3 py-2" open={!!company}>
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t.company.vat}><Input name="vat_number" defaultValue={v("vat_number")} /></Field>
          <Field label={t.company.size}><Input name="size_category" defaultValue={v("size_category")} /></Field>
          <Field label={t.company.website} error={err.website} className="sm:col-span-2"><Input name="website" placeholder="https://" defaultValue={v("website")} /></Field>
          <Field label={t.company.address} className="sm:col-span-2"><Input name="address" defaultValue={v("address")} /></Field>
        </div>
      </details>
      <Errors state={state} />
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

