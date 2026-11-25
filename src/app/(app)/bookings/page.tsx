import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { TestToggle } from "@/components/test-toggle";
import { LinkContactButton, NewBookingButton } from "@/components/booking-forms";
import { reprocessBookingEvents } from "@/lib/actions/bookings";
import { loadBookingFormData } from "@/lib/booking-data";
import { formatDateTime, formatEuro } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.bookingsPage.title };
const paymentTone = { paid: "success", unpaid: "warning", partially_paid: "warning", failed: "brand", refunded: "neutral", partially_refunded: "neutral" } as const;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ when?: string; test?: string }> }) {
  const sp = await searchParams;
  const when = ["past", "all", "unlinked"].includes(sp.when ?? "") ? (sp.when as string) : "upcoming";
  const showTests = sp.test === "1";
  const me = await getProfile();
  const supabase = await createClient();
  const now = new Date().toISOString();

  let q = supabase.from("bookings")
    .select("id,source,is_test,contact_id,customer_name,customer_email,customer_phone,service_name,resource_name,starts_at,status,payment_status,total_cents").limit(100);
  if (!showTests) q = q.eq("is_test", false);
  q = when === "upcoming" ? q.gte("starts_at", now).order("starts_at")
    : when === "past" ? q.lt("starts_at", now).order("starts_at", { ascending: false })
    : when === "unlinked" ? q.is("contact_id", null).order("starts_at", { ascending: false }) : q.order("starts_at", { ascending: false });
  const [{ data: rows }, { count: unlinked }, form] = await Promise.all([
    q,
    supabase.from("bookings").select("id", { count: "exact", head: true }).is("contact_id", null).eq("is_test", false),
    loadBookingFormData(supabase),
  ]);

  const admin = can(me.role, "settings.view");
  let health: { processed: number; unmapped: number; failed: number; tests: number; last: string | null; problems: { id: string; status: string; last_error: string | null; received_at: string }[] } | null = null;
  if (admin) {
    const [ev, problems] = await Promise.all([
      supabase.from("webhook_events").select("status,received_at").eq("provider", "bookings").order("received_at", { ascending: false }).limit(1000),
      supabase.from("webhook_events").select("id,status,last_error,received_at").eq("provider", "bookings").in("status", ["unmapped", "failed"]).order("received_at", { ascending: false }).limit(5),
    ]);
    const list = ev.data ?? [];
    health = {
      processed: list.filter((e) => e.status === "processed").length, unmapped: list.filter((e) => e.status === "unmapped").length,
      failed: list.filter((e) => e.status === "failed").length, tests: list.filter((e) => e.status === "ignored").length,
      last: list[0]?.received_at ?? null, problems: problems.data ?? [],
    };
  }
  const tabs = ([["upcoming", t.bookingsPage.upcoming], ["past", t.bookingsPage.past], ["all", t.bookingsPage.all], ["unlinked", `${t.contacts.notLinked}${unlinked ? ` (${unlinked})` : ""}`]] as const)
    .map(([k, label]) => ({ href: `/bookings${[k === "upcoming" ? "" : `when=${k}`, showTests ? "test=1" : ""].filter(Boolean).map((x, i) => `${i ? "&" : "?"}${x}`).join("")}`, label, active: when === k }));

  return (
    <>
      <PageHeader title={t.bookingsPage.title} subtitle={t.bookingsPage.paidNote}
        actions={can(me.role, "bookings.manage") ? <NewBookingButton {...form} canPay={can(me.role, "payments.record")} /> : undefined} />
      <div className="relative"><Tabs items={tabs} /><div className="absolute right-0 top-0"><TestToggle showTests={showTests} /></div></div>
      <Card>
        {rows?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[13px] text-muted">
                <tr>{[t.bookingsPage.when, t.bookingsPage.customer, t.bookingsPage.service, t.bookingsPage.resource, t.bookingsPage.status, t.bookingsPage.payment, t.bookingsPage.total].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-background">
                    <td className="whitespace-nowrap px-4 py-3"><Link href={`/bookings/${b.id}`} className="font-medium hover:underline">{formatDateTime(b.starts_at)}</Link></td>
                    <td className="px-4 py-3">
                      {b.contact_id ? <Link className="font-medium hover:underline" href={`/contacts/${b.contact_id}`}>{b.customer_name}</Link> : b.is_test ? (
                        <span className="flex items-center gap-2"><span>{b.customer_name ?? "—"}</span><Badge>{t.bookingsPage.testBadge}</Badge></span>
                      ) : (
                        <span className="flex items-center gap-2"><span>{b.customer_name ?? "—"}</span>{b.is_test && <Badge>{t.bookingsPage.testBadge}</Badge>}
                          <LinkContactButton entity="booking" id={b.id} suggest={b.customer_email ?? b.customer_name ?? undefined}
                            seed={{ first_name: b.customer_name?.split(" ")[0], last_name: b.customer_name?.split(" ").slice(1).join(" "), email: b.customer_email ?? undefined, phone: b.customer_phone ?? undefined }} /></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{b.service_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{b.resource_name ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={b.status === "cancelled" || b.status === "no_show" ? "brand" : b.status === "completed" ? "success" : "neutral"}>{t.bookingStatus[b.status as keyof typeof t.bookingStatus]}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={paymentTone[b.payment_status as keyof typeof paymentTone]}>{t.paymentStatus[b.payment_status as keyof typeof t.paymentStatus]}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3">{b.total_cents != null ? formatEuro(b.total_cents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t.bookingsPage.empty} hint={t.bookingsPage.emptyHint} />}
      </Card>

      {health && (
        <Card className="mt-6 p-5">
          <h2 className="text-sm font-semibold">{t.bookingsPage.link}</h2>
          <p className="mt-1 text-sm text-muted">{t.bookingsPage.linkHint}</p>
          <p className="mt-2 text-xs text-muted">{t.bookingsPage.urlHint} <Link href="/settings/integrations" className="underline">{t.settings.integrations}</Link></p>
          {!process.env.BOOKINGS_WEBHOOK_SECRET && <p className="mt-2 text-sm text-brand">{t.bookingsPage.secretMissing}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="success">{health.processed} {t.bookingsPage.processed}</Badge>
            {health.tests > 0 && <Badge>{health.tests} {t.bookingsPage.tests}</Badge>}
            <Badge tone="warning">{health.unmapped} {t.bookingsPage.unmapped}</Badge>
            <Badge tone="brand">{health.failed} {t.bookingsPage.failed}</Badge>
            <span className="text-xs text-muted">{t.bookingsPage.lastEvent}: {health.last ? formatDateTime(health.last) : t.bookingsPage.waiting}</span>
          </div>
          {health.problems.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-medium">{t.bookingsPage.problems}</p>
              <ul className="space-y-1 text-xs text-muted">{health.problems.map((p) => <li key={p.id}>{formatDateTime(p.received_at)} · {p.last_error ?? p.status}</li>)}</ul>
              <form action={reprocessBookingEvents} className="mt-3"><Button type="submit" size="sm" variant="secondary">{t.bookingsPage.reprocess}</Button></form>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
