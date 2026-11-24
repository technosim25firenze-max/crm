"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, type ButtonVariant } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker, type NewContactSeed } from "@/components/contact-picker";
import { createManualBooking, createContactFromBooking, linkExistingToContact, linkToContact, updateManualBooking, type LinkEntity } from "@/lib/actions/bookings";
import { toRomeLocalInput } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { ActionState } from "@/lib/actions/shared";

export interface BookingDefaults {
  id: string; service_name: string | null; resource_name: string | null; starts_local: string; duration: number; participants: number | null;
  total: string; status: string; notes: string | null; staff_notes: string | null;
}
interface Props {
  services: { id: string; name: string; duration_minutes: number | null; default_price_cents: number | null }[];
  resources: string[]; canPay: boolean; preset?: { id: string; name: string } | null; def?: BookingDefaults;
}

function BookingForm({ services, resources, canPay, preset, def, onDone }: Props & { onDone: () => void }) {
  const action = def ? updateManualBooking.bind(null, def.id) : createManualBooking;
  const [state, formAction] = useActionState(action, null as ActionState | null);
  const [now] = useState(() => toRomeLocalInput());
  const [duration, setDuration] = useState(String(def?.duration ?? 60));
  const [total, setTotal] = useState(def?.total ?? "");
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const e = state?.fieldErrors ?? {};

  function onService(name: string) {
    const s = services.find((x) => x.name === name);
    if (!s) return;
    if (s.duration_minutes) setDuration(String(s.duration_minutes));
    if (s.default_price_cents != null && !def) setTotal((s.default_price_cents / 100).toFixed(2).replace(".", ","));
  }

  return (
    <form action={formAction} className="space-y-4">
      {!def && (
        <Field label={t.sales.contact} error={e.contact_id}><ContactPicker initial={preset} allowCreate /></Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.bookingsPage.startsAt} error={e.starts_at}><Input name="starts_at" type="datetime-local" defaultValue={def?.starts_local ?? now} required /></Field>
        <Field label={t.bookingsPage.duration} error={e.duration}><Input name="duration" inputMode="numeric" value={duration} onChange={(ev) => setDuration(ev.target.value)} /></Field>
        <Field label={t.bookingsPage.serviceField}>
          <Input name="service_name" list="svc-list" defaultValue={def?.service_name ?? ""} onChange={(ev) => onService(ev.target.value)} placeholder="Es. Prenotazione 1h" />
          <datalist id="svc-list">{services.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        <Field label={t.bookingsPage.resourceField}>
          <Input name="resource_name" list="res-list" defaultValue={def?.resource_name ?? ""} placeholder="Es. SIM-STATIC-1" />
          <datalist id="res-list">{resources.map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label={t.bookingsPage.totalField} error={e.total}><Input name="total" inputMode="decimal" placeholder="0,00" value={total} onChange={(ev) => setTotal(ev.target.value)} /></Field>
        {!def && canPay && <Field label={t.bookingsPage.paidNow} error={e.paid}><Input name="paid" inputMode="decimal" placeholder="0,00" /></Field>}
        {!def && canPay && (
          <Field label={t.finance.method} error={e.method}>
            <Select name="method" defaultValue="cash">{(["cash", "card_pos", "bank_transfer", "gift_card", "other"] as const).map((m) => <option key={m} value={m}>{t.finance.methods[m]}</option>)}</Select>
          </Field>
        )}
      </div>
      <details className="rounded-lg border border-border px-3 py-2" open={!!def}>
        <summary className="cursor-pointer text-sm font-medium">{t.common.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t.bookingsPage.participants} error={e.participants}><Input name="participants" inputMode="numeric" defaultValue={def?.participants ?? ""} /></Field>
          <Field label={t.bookingsPage.statusField}>
            <Select name="status" defaultValue={def?.status ?? "confirmed"}>
              {(["pending", "confirmed", "completed", "no_show"] as const).map((s) => <option key={s} value={s}>{t.bookingStatus[s]}</option>)}
            </Select>
          </Field>
          <Field label={t.bookingsPage.customerNotes} className="sm:col-span-2"><Textarea name="notes" defaultValue={def?.notes ?? ""} /></Field>
          <Field label={t.bookingsPage.staffNotes} className="sm:col-span-2"><Textarea name="staff_notes" defaultValue={def?.staff_notes ?? ""} /></Field>
        </div>
      </details>
      {state?.warning && (
        <div className="rounded-lg border border-amber-300 bg-warning-soft p-3 text-sm"><p>{state.warning}</p><input type="hidden" name="confirm" value="1" /></div>
      )}
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{state?.warning ? t.bookingsPage.saveAnyway : t.common.save}</SubmitButton></div>
    </form>
  );
}

export const NewBookingButton = (p: Props & { variant?: ButtonVariant }) => (
  <Modal trigger={t.bookingsPage.new} title={t.bookingsPage.new} variant={p.variant}>{(close) => <BookingForm {...p} onDone={close} />}</Modal>
);
export const EditBookingButton = (p: Props) => (
  <Modal trigger={t.common.edit} title={t.bookingsPage.edit} variant="secondary">{(close) => <BookingForm {...p} onDone={close} />}</Modal>
);

// ---------------------------------------------------------------- collegamento a contatto
function LinkForm({ entity, id, suggest, seed, onDone }: { entity: LinkEntity; id: string; suggest?: string; seed?: NewContactSeed; onDone: () => void }) {
  const [state, action] = useActionState(linkToContact.bind(null, entity, id), null as ActionState | null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <Field label={t.sales.contact} error={state?.fieldErrors?.contact_id}><ContactPicker allowCreate suggest={suggest} seed={seed} /></Field>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </form>
  );
}

/** Pulsante "Collega a un contatto": cerca tra i contatti (precompilato con i dati disponibili) o crea il contatto al volo. */
export const LinkContactButton = ({ entity, id, suggest, seed, label, variant = "secondary", size = "sm" }: {
  entity: LinkEntity; id: string; suggest?: string; seed?: NewContactSeed; label?: string; variant?: ButtonVariant; size?: "md" | "sm";
}) => (
  <Modal trigger={label ?? t.contacts.link} title={t.contacts.linkTitle} description={t.contacts.linkHint} variant={variant} size={size}>
    {(close) => <LinkForm entity={entity} id={id} suggest={suggest} seed={seed} onDone={close} />}
  </Modal>
);

/** Dalla scheda contatto: elenco di elementi non collegati, ciascuno collegabile con un clic. */
export function LinkExistingButton({ entity, contactId, items, label }: { entity: LinkEntity; contactId: string; items: { id: string; label: string; sub?: string }[]; label?: string }) {
  return (
    <Modal trigger={label ?? t.contacts.linkExisting} title={t.contacts.linkExisting} description={t.contacts.linkExistingHint} variant="secondary">
      {(close) => items.length ? (
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-lg border border-border">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{i.label}</span>{i.sub && <span className="block truncate text-xs text-muted">{i.sub}</span>}</span>
              <form action={async () => { await linkExistingToContact(entity, contactId, i.id); close(); }}><SubmitButton size="sm" variant="secondary">{t.contacts.linkShort}</SubmitButton></form>
            </li>
          ))}
        </ul>
      ) : <p className="py-6 text-center text-sm text-muted">{t.contacts.nothingToLink}</p>}
    </Modal>
  );
}

export function CreateFromBookingButton({ bookingId }: { bookingId: string }) {
  return (
    <form action={createContactFromBooking.bind(null, bookingId)}><SubmitButton size="sm" variant="ghost">{t.contacts.createFromData}</SubmitButton></form>
  );
}
