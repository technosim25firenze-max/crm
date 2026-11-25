import Link from "@/components/nav-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Button, Card, EmptyState, PageHeader, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/forms";
import { CreateFromBookingButton, EditBookingButton, LinkContactButton } from "@/components/booking-forms";
import { RecordPaymentButton } from "@/components/finance-forms";
import { SubmitButton } from "@/components/submit-button";
import { deleteManualBooking, saveStaffNotes, setBookingStatus } from "@/lib/actions/bookings";
import { loadBookingFormData } from "@/lib/booking-data";
import { bookingOutstandingCents } from "@/lib/finance";
import { formatDateTime, formatEuro, toRomeLocalInput } from "@/lib/format";
import { t } from "@/lib/i18n/it";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children || "—"}</dd></div>;
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  const supabase = await createClient();
  const { data: b } = await supabase.from("bookings").select("*,contacts(id,display_name)").eq("id", id).maybeSingle();
  if (!b) notFound();
  const contact = b.contacts as unknown as { id: string; display_name: string } | null;
  const manual = b.source === "manual";
  const finance = can(me.role, "payments.record");
  const manage = can(me.role, "bookings.manage");
  const form = await loadBookingFormData(supabase);
  const { data: pays } = finance ? await supabase.from("payments").select("id,kind,amount_cents,method,paid_at,source,reference").eq("booking_id", id).order("paid_at", { ascending: false }) : { data: null };
  const { data: services } = finance ? await supabase.from("services").select("id,name,vat_rate").eq("active", true).order("name") : { data: null };

  const manualNet = (pays ?? []).filter((p) => p.source === "manual").reduce((a, p) => a + (p.kind === "refund" ? -1 : 1) * p.amount_cents, 0);
  const declared = manual ? 0 : b.paid_cents;
  const residual = bookingOutstandingCents(b.total_cents, declared, manualNet);
  const d = (b.details ?? {}) as Record<string, unknown>;
  const attr = (b.attribution ?? {}) as Record<string, string>;
  const minutes = b.starts_at && b.ends_at ? Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000) : 60;
  const title = b.service_name ?? t.bookingsPage.title;

  return (
    <>
      <PageHeader title={`${title}${b.booking_number ? ` · ${t.bookingsPage.number}${b.booking_number}` : ""}`}
        actions={<>
          {finance && <RecordPaymentButton variant="secondary" services={(services ?? []).map((s) => ({ ...s, vat_rate: Number(s.vat_rate) }))}
            preset={{ booking_id: id, contact: contact ? { id: contact.id, name: contact.display_name } : null, amount: residual > 0 ? (residual / 100).toFixed(2).replace(".", ",") : undefined }} />}
          {manual && manage && (
            <EditBookingButton {...form} canPay={finance} def={{ id, service_name: b.service_name, resource_name: b.resource_name, starts_local: toRomeLocalInput(new Date(b.starts_at)), duration: minutes,
              participants: b.participants, total: b.total_cents != null ? (b.total_cents / 100).toFixed(2).replace(".", ",") : "", status: b.status === "cancelled" ? "confirmed" : b.status, notes: b.notes, staff_notes: b.staff_notes }} />
          )}
        </>} />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Badge>{manual ? t.bookingsPage.sourceManual : t.bookingsPage.sourceWebsite}</Badge>
        <Badge tone={b.status === "cancelled" || b.status === "no_show" ? "brand" : b.status === "completed" ? "success" : "neutral"}>{t.bookingStatus[b.status as keyof typeof t.bookingStatus]}</Badge>
        <Badge tone={b.payment_status === "paid" ? "success" : "warning"}>{t.paymentStatus[b.payment_status as keyof typeof t.paymentStatus]}</Badge>
        {manual && manage && b.status !== "cancelled" && <ConfirmButton size="sm" variant="secondary" label={t.bookingsPage.cancelBooking} title={t.bookingsPage.cancelBooking} body={t.bookingsPage.cancelBody} action={setBookingStatus.bind(null, id, "cancelled")} />}
        {manual && manage && b.status === "cancelled" && <form action={setBookingStatus.bind(null, id, "confirmed")}><SubmitButton size="sm" variant="secondary">{t.tasks.reopen}</SubmitButton></form>}
        {manual && can(me.role, "contacts.archive") && <ConfirmButton size="sm" label={t.bookingsPage.deleteBooking} title={t.bookingsPage.deleteBooking} body={t.bookingsPage.deleteBody} action={deleteManualBooking.bind(null, id)} />}
      </div>
      {!manual && <p className="mb-4 text-sm text-muted">{t.bookingsPage.platformReadOnly}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.bookingsPage.details}</h2>
            <dl>
              <Row label={t.sales.contact}>
                {contact ? <span className="inline-flex items-center gap-2"><Link className="underline" href={`/contacts/${contact.id}`}>{contact.display_name}</Link>{manage && <LinkContactButton entity="booking" id={id} label={t.contacts.changeContact} variant="ghost" />}</span>
                  : <span className="inline-flex flex-wrap items-center justify-end gap-2"><span className="text-muted">{b.customer_name ?? t.contacts.notLinked}</span>
                    <LinkContactButton entity="booking" id={id} suggest={b.customer_email ?? b.customer_name ?? undefined}
                      seed={{ first_name: b.customer_name?.split(" ")[0], last_name: b.customer_name?.split(" ").slice(1).join(" "), email: b.customer_email ?? undefined, phone: b.customer_phone ?? undefined }} />
                    {!manual && <CreateFromBookingButton bookingId={id} />}</span>}
              </Row>
              {!contact && (b.customer_email || b.customer_phone) && <Row label={t.bookingsPage.customerData}>{[b.customer_email, b.customer_phone].filter(Boolean).join(" · ")}</Row>}
              <Row label={t.bookingsPage.startsAt}>{formatDateTime(b.starts_at)}</Row>
              <Row label={t.bookingsPage.duration}>{minutes}</Row>
              <Row label={t.bookingsPage.resourceField}>{b.resource_name}</Row>
              <Row label={t.bookingsPage.participants}>{b.participants}</Row>
              <Row label={t.bookingsPage.customerNotes}>{b.notes}</Row>
              {typeof d.promo_discount_percentage === "number" && <Row label={t.bookingsPage.promo}>{d.promo_discount_percentage}%</Row>}
              {Array.isArray(d.extra_services) && d.extra_services.length > 0 && <Row label={t.bookingsPage.extras}>{d.extra_services.length}</Row>}
            </dl>
          </Card>
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.bookingsPage.payments}</h2>
            <dl>
              <Row label={t.bookingsPage.totalField.replace(" (€)", "")}>{b.total_cents != null ? formatEuro(b.total_cents) : null}</Row>
              {!manual && <Row label={t.bookingsPage.paidByPlatform}>{formatEuro(b.paid_cents)}{d.payment_option === "DEPOSIT" ? ` (${t.bookingsPage.optionDeposit.toLowerCase()})` : ""}</Row>}
              {finance && <Row label={t.bookingsPage.recordedPayments}>{formatEuro(manualNet)}</Row>}
              <Row label={t.bookingsPage.residual}><span className={residual > 0 ? "text-brand" : ""}>{formatEuro(residual)}</span></Row>
            </dl>
            {finance && (
              <div className="mt-3 border-t border-border pt-2">
                {pays?.length ? <ul className="divide-y divide-border">{pays.map((p) => (
                  <li key={p.id} className="flex justify-between py-2 text-sm"><span>{p.kind === "refund" ? t.finance.kindRefund : t.finance.kindPayment} · {t.finance.methods[p.method as keyof typeof t.finance.methods]}<span className="block text-xs text-muted">{formatDateTime(p.paid_at)}{p.reference ? ` · ${p.reference}` : ""}</span></span>
                    <span className={p.kind === "refund" ? "text-brand" : "font-medium"}>{p.kind === "refund" ? "−" : ""}{formatEuro(p.amount_cents)}</span></li>))}</ul> : <EmptyState title={t.finance.emptyPayments} />}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          {manage && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">{t.bookingsPage.staffNotes}</h2>
              <form action={saveStaffNotes.bind(null, id)} className="space-y-2"><Textarea name="staff_notes" defaultValue={b.staff_notes ?? ""} /><SubmitButton variant="secondary" size="sm">{t.common.save}</SubmitButton></form>
            </Card>
          )}
          {manual && manage && b.status !== "cancelled" && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">{t.bookingsPage.statusField}</h2>
              <div className="flex flex-wrap gap-2">
                {(["confirmed", "completed", "no_show"] as const).filter((s) => s !== b.status).map((s) => (
                  <form key={s} action={setBookingStatus.bind(null, id, s)}><Button type="submit" size="sm" variant="secondary">{t.bookingStatus[s]}</Button></form>
                ))}
              </div>
            </Card>
          )}
          {!manual && Object.keys(attr).length > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 text-sm font-semibold">{t.bookingsPage.attribution}</h2>
              <dl className="text-sm">{Object.entries(attr).map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-1"><dt className="text-muted">{k}</dt><dd className="truncate font-medium">{v}</dd></div>)}</dl>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
