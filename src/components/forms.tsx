"use client";
import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, type ButtonVariant } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContactForm, CompanyForm } from "@/components/entity-form";
import { createContact, updateContact } from "@/lib/actions/contacts";
import { createCompany, updateCompany } from "@/lib/actions/companies";
import { addDocument, addNote, recordConsent } from "@/lib/actions/related";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";
import type { Company, Contact } from "@/lib/types";

type Action = (prev: ActionState | null, fd: FormData) => Promise<ActionState>;
type Parent = { contact_id: string } | { company_id: string } | { opportunity_id: string };

export const NewContactButton = () => (
  <Modal trigger={t.contacts.new} title={t.contacts.new}><ContactForm action={createContact} /></Modal>
);
export const NewCompanyButton = () => (
  <Modal trigger={t.contacts.newCompany} title={t.contacts.newCompany}><CompanyForm action={createCompany} /></Modal>
);
export const EditContactButton = ({ contact }: { contact: Contact }) => (
  <Modal trigger={t.common.edit} variant="secondary" title={t.common.edit}>
    {(close) => <ContactForm contact={contact} action={updateContact.bind(null, contact.id)} onDone={close} />}
  </Modal>
);
export const EditCompanyButton = ({ company }: { company: Company }) => (
  <Modal trigger={t.common.edit} variant="secondary" title={t.common.edit}>
    {(close) => <CompanyForm company={company} action={updateCompany.bind(null, company.id)} onDone={close} />}
  </Modal>
);

/** Modale di conferma per azioni irreversibili o delicate. `action` è una server action già legata ai parametri. */
export function ConfirmButton({ label, title, body, action, variant = "danger", size = "md" }: {
  label: string; title: string; body: string; action: () => Promise<void>; variant?: ButtonVariant; size?: "md" | "sm";
}) {
  return (
    <Modal trigger={label} title={title} description={body} variant={variant} size={size}>
      <form action={action} className="flex justify-end"><SubmitButton variant={variant === "danger" ? "primary" : variant}>{t.common.confirm}</SubmitButton></form>
    </Modal>
  );
}

/** Form che si svuota dopo il salvataggio (note, documenti, consensi). */
function ResettingForm({ action, children, }: { action: Action; children: (s: ActionState | null) => React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {children(state)}
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
    </form>
  );
}

export function NoteForm({ parent }: { parent: Parent }) {
  return (
    <ResettingForm action={addNote.bind(null, parent)}>
      {(s) => (
        <>
          <Field label={t.notes.add} error={s?.fieldErrors?.body}><Textarea name="body" placeholder={t.notes.placeholder} required /></Field>
          <div className="flex justify-end"><SubmitButton>{t.notes.add}</SubmitButton></div>
        </>
      )}
    </ResettingForm>
  );
}

export function DocumentForm({ parent }: { parent: Parent }) {
  return (
    <Modal trigger={t.documents.add} variant="secondary" title={t.documents.add} description={t.documents.hint}>
      {(close) => (
        <ResettingFormClose action={addDocument.bind(null, parent)} close={close}>
          {(s) => (
            <>
              <Field label={t.documents.title} error={s?.fieldErrors?.title}><Input name="title" required autoFocus /></Field>
              <Field label={t.documents.category}><Input name="category" placeholder="Contratto, preventivo…" /></Field>
              <Field label={t.documents.url} error={s?.fieldErrors?.url}><Input name="url" placeholder="https://" /></Field>
              <Field label={t.documents.upload} error={s?.fieldErrors?.file}>
                <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.docx,.xlsx" className="block w-full text-sm" />
              </Field>
              <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
            </>
          )}
        </ResettingFormClose>
      )}
    </Modal>
  );
}

function ResettingFormClose({ action, close, children }: { action: Action; close: () => void; children: (s: ActionState | null) => React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => { if (state?.ok) close(); }, [state, close]);
  return (
    <form action={formAction} className="space-y-3">
      {children(state)}
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
    </form>
  );
}

export function ConsentForm({ contactId }: { contactId: string }) {
  return (
    <ResettingForm action={recordConsent.bind(null, contactId)}>
      {(s) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.consents.channel}>
              <Select name="channel">{Object.entries(t.consents.channels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Field>
            <Field label={t.consents.status}>
              <Select name="status"><option value="granted">{t.consents.granted}</option><option value="withdrawn">{t.consents.withdrawn}</option></Select>
            </Field>
          </div>
          <Field label={t.consents.evidence} error={s?.fieldErrors?.evidence}><Input name="evidence" placeholder="Es. modulo sito del 18/11/2026" /></Field>
          <div className="flex justify-end"><SubmitButton>{t.consents.record}</SubmitButton></div>
        </>
      )}
    </ResettingForm>
  );
}
