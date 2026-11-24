import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { summarizePayments, type PaymentRow } from "@/lib/finance";
import { formatDate, formatDateTime, formatEuro, formatNumber, romeMidnightUtc, romeToday, startOfMonthRome } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.dashboard.title };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="p-4"><p className="text-[13px] text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="mt-1 text-xs text-muted">{sub}</p>}</Card>;
}

export default async function DashboardPage() {
  const me = await getProfile();
  const finance = can(me.role, "finance.view");
  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonthRome(now).toISOString();
  const td = romeToday(now);
  const dayStart = romeMidnightUtc(td.y, td.m, td.d);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const today = `${td.y}-${String(td.m).padStart(2, "0")}-${String(td.d).padStart(2, "0")}`;

  const [newContacts, todayBookings, upcoming, openOpps, myTasks, recent, pays] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }).is("archived_at", null).gte("created_at", monthStart),
    supabase.from("bookings").select("id", { count: "exact", head: true }).neq("status", "cancelled").gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()),
    supabase.from("bookings").select("id,customer_name,service_name,resource_name,starts_at").neq("status", "cancelled").gte("starts_at", now.toISOString()).order("starts_at").limit(5),
    supabase.from("opportunities").select("expected_value_cents,agreed_value_cents,pipeline_stages!inner(kind)").eq("pipeline_stages.kind", "open").limit(5000),
    supabase.from("tasks").select("id,title,due_date,priority").eq("assigned_to", me.id).is("done_at", null).lte("due_date", today).order("due_date").limit(6),
    supabase.from("contacts").select("id,display_name,email,kind,created_at").is("archived_at", null).order("created_at", { ascending: false }).limit(5),
    finance
      ? supabase.from("payments").select("id,kind,amount_cents,vat_rate,method,paid_at,contact_id,contacts(display_name)").order("paid_at", { ascending: false }).limit(60)
      : Promise.resolve({ data: null }),
  ]);
  const opps = openOpps.data ?? [];
  const oppValue = opps.reduce((a, o) => a + (o.expected_value_cents ?? 0), 0);
  const monthPays = ((pays.data ?? []) as unknown as (PaymentRow & { id: string; contact_id: string | null; contacts: { display_name: string } | null })[]);
  // Per l'incassato del mese serve l'intero mese, non solo gli ultimi 60 movimenti.
  const monthRows = finance ? ((await supabase.from("payments").select("kind,amount_cents,vat_rate,method,paid_at").gte("paid_at", monthStart).limit(5000)).data ?? []) as PaymentRow[] : [];
  const overdue = (myTasks.data ?? []).filter((x) => x.due_date && x.due_date < today).length;

  return (
    <>
      <PageHeader title={t.dashboard.title} subtitle={t.dashboard.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {finance && <Kpi label={t.dashboard.revenueMonth} value={formatEuro(summarizePayments(monthRows).netCents)} />}
        <Kpi label={t.dashboard.bookingsToday} value={formatNumber(todayBookings.count ?? 0)} />
        <Kpi label={t.dashboard.openOpps} value={formatNumber(opps.length)} sub={`${t.dashboard.pipelineValue}: ${formatEuro(oppValue)}`} />
        <Kpi label={t.dashboard.newThisMonth} value={formatNumber(newContacts.count ?? 0)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t.dashboard.tasks} {overdue > 0 && <Badge tone="brand" className="ml-1">{overdue} {t.dashboard.overdueCount}</Badge>}</h2>
            <Link href="/sales?tab=tasks" className="text-xs text-muted hover:text-foreground">{t.dashboard.tasksAll}</Link>
          </div>
          {myTasks.data?.length ? (
            <ul className="divide-y divide-border">{myTasks.data.map((x) => (
              <li key={x.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span>{x.title}</span><span className={`text-xs ${x.due_date && x.due_date < today ? "font-medium text-brand" : "text-muted"}`}>{formatDate(x.due_date)}</span></li>))}
            </ul>
          ) : <EmptyState title={t.dashboard.tasksEmpty} />}
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t.dashboard.upcoming}</h2><Link href="/bookings" className="text-xs text-muted hover:text-foreground">{t.dashboard.tasksAll}</Link></div>
          {upcoming.data?.length ? (
            <ul className="divide-y divide-border">{upcoming.data.map((b) => (
              <li key={b.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span>{b.customer_name ?? "—"}<span className="block text-xs text-muted">{[b.service_name, b.resource_name].filter(Boolean).join(" · ")}</span></span><span className="whitespace-nowrap text-xs text-muted">{formatDateTime(b.starts_at)}</span></li>))}
            </ul>
          ) : <EmptyState title={t.dashboard.upcomingEmpty} />}
        </Card>
        <Card>
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.dashboard.recent}</h2>
          {recent.data?.length ? (
            <ul className="divide-y divide-border">{recent.data.map((c) => (
              <li key={c.id}><Link href={`/contacts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-background">
                <span className="font-medium">{c.display_name}</span><span className="flex items-center gap-2 text-xs text-muted"><Badge>{t.kinds[c.kind as keyof typeof t.kinds]}</Badge>{formatDate(c.created_at)}</span></Link></li>))}
            </ul>
          ) : <EmptyState title={t.dashboard.recentEmpty} hint={t.contacts.emptyHint} />}
        </Card>
        {finance && (
          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t.dashboard.payments}</h2><Link href="/finance?tab=payments" className="text-xs text-muted hover:text-foreground">{t.dashboard.tasksAll}</Link></div>
            {monthPays.length ? (
              <ul className="divide-y divide-border">{monthPays.slice(0, 5).map((p) => (
                <li key={p.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span>{p.contacts?.display_name ?? t.finance.methods[p.method as keyof typeof t.finance.methods]}<span className="block text-xs text-muted">{formatDateTime(p.paid_at)}</span></span>
                  <span className={p.kind === "refund" ? "text-brand" : "font-medium"}>{p.kind === "refund" ? "−" : ""}{formatEuro(p.amount_cents)}</span></li>))}
              </ul>
            ) : <EmptyState title={t.dashboard.paymentsEmpty} />}
          </Card>
        )}
      </div>
    </>
  );
}
