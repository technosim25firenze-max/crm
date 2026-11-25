import Link from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { RangeBar } from "@/components/range-bar";
import { BarsChart } from "@/components/charts";
import { AddSpendButton } from "@/components/spend-form";
import { deleteSpend } from "@/lib/actions/marketing";
import { previousRange, resolveRange } from "@/lib/dates";
import { AD_SOURCES, bookingStats, marketingKpis, returningCustomers } from "@/lib/analytics";
import { growthPercent, summarizePayments, type PaymentRow } from "@/lib/finance";
import { formatDate, formatEuro, formatNumber, romeMonthKey } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.analytics.title };
type Search = { tab?: string; range?: string; from?: string; to?: string };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="p-4"><p className="text-[13px] text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="mt-1 text-xs text-muted">{sub}</p>}</Card>;
}
const pct = (x: number) => `${(Math.round(x * 1000) / 10).toString().replace(".", ",")}%`;
const monthLabel = (k: string) => `${k.slice(5)}/${k.slice(2, 4)}`;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("analytics.view");
  const me = await getProfile();
  const finance = can(me.role, "finance.view");
  const sp = await searchParams;
  const allowed = (finance ? ["revenue", "customers", "bookings", "marketing"] : ["customers", "bookings", "marketing"]) as string[];
  const tab = allowed.includes(sp.tab ?? "") ? (sp.tab as string) : allowed[0];
  const range = resolveRange(sp);
  const prev = previousRange(range);
  const supabase = await createClient();
  const iso = (d: Date) => d.toISOString();
  const tabs = allowed.map((k) => ({
    href: `/analytics?${new URLSearchParams({ tab: k, range: range.key, ...(range.key === "custom" ? { from: range.fromStr, to: range.toStr } : {}) })}`,
    label: t.analytics.tabs[k as keyof typeof t.analytics.tabs], active: tab === k,
  }));
  let body: React.ReactNode;
  let actions: React.ReactNode;

  if (tab === "revenue") {
    const [{ data }, { data: prevData }] = await Promise.all([
      supabase.from("payments").select("kind,amount_cents,vat_rate,method,paid_at,service_id,contact_id,services(name),contacts(kind)").gte("paid_at", iso(range.from)).lt("paid_at", iso(range.to)).limit(5000),
      supabase.from("payments").select("kind,amount_cents,vat_rate,method,paid_at").gte("paid_at", iso(prev.from)).lt("paid_at", iso(prev.to)).limit(5000),
    ]);
    const rows = (data ?? []) as unknown as (PaymentRow & { services: { name: string } | null; contacts: { kind: string } | null })[];
    const sum = summarizePayments(rows), prevSum = summarizePayments((prevData ?? []) as PaymentRow[]);
    const g = growthPercent(sum.netCents, prevSum.netCents);
    const bucket = (keyOf: (r: (typeof rows)[number]) => string) => {
      const m = new Map<string, number>();
      rows.forEach((r) => m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + (r.kind === "refund" ? -1 : 1) * Math.round(r.amount_cents / (1 + r.vat_rate / 100))));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const byService = bucket((r) => r.services?.name ?? t.analytics.unspecified);
    const byKind = bucket((r) => (r.contacts ? t.kinds[r.contacts.kind as keyof typeof t.kinds] ?? r.contacts.kind : t.analytics.unspecified));
    const daily = range.to.getTime() - range.from.getTime() <= 45 * 86400000;
    const chart = Object.entries(daily ? sum.byDay : sum.byMonth).sort().map(([k, v]) => ({ label: daily ? `${k.slice(8)}/${k.slice(5, 7)}` : monthLabel(k), value: v }));
    const list = (title: string, items: [string, number][]) => (
      <Card>
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
        {items.length ? <ul className="divide-y divide-border">{items.map(([n, v]) => <li key={n} className="flex justify-between px-4 py-2.5 text-sm"><span>{n}</span><span className="font-medium">{formatEuro(v)}</span></li>)}</ul> : <EmptyState title={t.analytics.noData} />}
      </Card>
    );
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label={t.finance.collectedNet} value={formatEuro(sum.netCents)} sub={g != null ? `${g > 0 ? "+" : ""}${String(g).replace(".", ",")}% ${t.ranges.vsPrev}` : undefined} />
          <Kpi label={t.finance.count} value={formatNumber(sum.count)} />
          <Kpi label={t.finance.avgTicket} value={formatEuro(sum.averageGrossCents)} sub={t.finance.gross} />
        </div>
        <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">{t.finance.trend}</h2>{chart.length ? <BarsChart data={chart} euro /> : <EmptyState title={t.analytics.noData} />}</Card>
        <div className="grid gap-4 lg:grid-cols-2">{list(t.analytics.byService, byService)}{list(t.finance.byMethod, Object.entries(sum.byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => [t.finance.methods[m as keyof typeof t.finance.methods], v]))}</div>
        {list(`${t.finance.contact}: B2B / B2C`, byKind)}
      </div>
    );
  } else if (tab === "customers") {
    const [{ data: contacts }, { data: bks }, payRes] = await Promise.all([
      supabase.from("contacts").select("source,created_at").is("archived_at", null).gte("created_at", iso(range.from)).lt("created_at", iso(range.to)).limit(10000),
      supabase.from("bookings").select("contact_id,status").eq("is_test", false).limit(20000),
      finance ? supabase.from("payments").select("contact_id,kind,amount_cents,vat_rate,contacts(display_name)").limit(20000) : Promise.resolve({ data: null }),
    ]);
    const pays = (payRes.data ?? null) as unknown as { contact_id: string | null; kind: string; amount_cents: number; vat_rate: number; contacts: { display_name: string } | null }[] | null;
    const rep = returningCustomers((bks ?? []) as { contact_id: string | null; status: string }[], pays);
    const perMonth = new Map<string, number>(), perSource = new Map<string, number>();
    (contacts ?? []).forEach((c) => { const k = romeMonthKey(c.created_at); perMonth.set(k, (perMonth.get(k) ?? 0) + 1); perSource.set(c.source, (perSource.get(c.source) ?? 0) + 1); });
    const top = new Map<string, { name: string; net: number; id: string }>();
    pays?.forEach((p) => { if (!p.contact_id) return; const cur = top.get(p.contact_id) ?? { name: p.contacts?.display_name ?? "—", net: 0, id: p.contact_id }; cur.net += (p.kind === "refund" ? -1 : 1) * Math.round(p.amount_cents / (1 + p.vat_rate / 100)); top.set(p.contact_id, cur); });
    const topList = [...top.values()].sort((a, b) => b.net - a.net).slice(0, 10).filter((x) => x.net > 0);
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label={t.analytics.newContacts} value={formatNumber(contacts?.length ?? 0)} />
          <Kpi label={t.analytics.returning} value={formatNumber(rep.returning)} sub={rep.customers ? `${pct(rep.rate)} · ${t.analytics.returningHint}` : t.analytics.returningHint} />
          <Kpi label={t.finance.count} value={formatNumber(rep.customers)} sub={t.analytics.customersCount} />
        </div>
        <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">{t.analytics.newContacts}</h2>
          {perMonth.size ? <BarsChart data={[...perMonth.entries()].sort().map(([k, v]) => ({ label: monthLabel(k), value: v }))} /> : <EmptyState title={t.analytics.noData} />}</Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.analytics.bySource}</h2>
            {perSource.size ? <ul className="divide-y divide-border">{[...perSource.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => <li key={s} className="flex justify-between px-4 py-2.5 text-sm"><span>{t.sources[s as keyof typeof t.sources] ?? s}</span><span className="font-medium">{n}</span></li>)}</ul> : <EmptyState title={t.analytics.noData} />}</Card>
          {finance && <Card><h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.analytics.topCustomers}</h2>
            {topList.length ? <ul className="divide-y divide-border">{topList.map((c) => <li key={c.id} className="flex justify-between px-4 py-2.5 text-sm"><Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{c.name}</Link><span>{formatEuro(c.net)}</span></li>)}</ul> : <EmptyState title={t.analytics.noData} />}</Card>}
        </div>
      </div>
    );
  } else if (tab === "bookings") {
    const { data } = await supabase.from("bookings").select("starts_at,status,resource_name,service_name").eq("is_test", false).gte("starts_at", iso(range.from)).lt("starts_at", iso(range.to)).limit(20000);
    const s = bookingStats((data ?? []) as never);
    const entries = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8);
    body = s.total === 0 ? <Card><EmptyState title={t.analytics.noData} hint={t.bookingsPage.emptyHint} /></Card> : (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t.analytics.bookingsCount} value={formatNumber(s.total)} sub={`${t.bookingStatus.completed}: ${s.completed}`} />
          <Kpi label={t.analytics.cancelled} value={formatNumber(s.cancelled)} />
          <Kpi label={t.analytics.noShow} value={formatNumber(s.noShow)} sub={pct(s.noShowRate)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">{t.analytics.byWeekday}</h2><BarsChart data={t.analytics.weekdays.map((l, i) => ({ label: l, value: s.byWeekday[i] }))} /></Card>
          <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">{t.analytics.byHour}</h2><BarsChart data={s.byHour.map((v, h) => ({ label: String(h), value: v })).filter((_, h) => h >= 8 && h <= 23)} /></Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {([[t.bookingsPage.resource, s.byResource], [t.bookingsPage.service, s.byService]] as [string, Record<string, number>][]).map(([title, o]) => (
            <Card key={title}><h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
              {entries(o).length ? <ul className="divide-y divide-border">{entries(o).map(([n, v]) => <li key={n} className="flex justify-between px-4 py-2.5 text-sm"><span>{n}</span><span className="font-medium">{v}</span></li>)}</ul> : <EmptyState title={t.analytics.noData} />}</Card>
          ))}
        </div>
      </div>
    );
  } else {
    const spendAllowed = can(me.role, "marketing.spend");
    actions = spendAllowed ? <AddSpendButton /> : undefined;
    const [{ data: spend }, { data: contacts }, { data: opps }, rev] = await Promise.all([
      supabase.from("marketing_spend").select("id,platform,campaign,period_start,period_end,amount_cents,impressions,clicks,leads").gte("period_start", range.fromStr).lte("period_start", range.toStr).order("period_start", { ascending: false }),
      supabase.from("contacts").select("source").is("archived_at", null).gte("created_at", iso(range.from)).lt("created_at", iso(range.to)).limit(10000),
      supabase.from("opportunities").select("source,pipeline_stages(kind)").gte("created_at", iso(range.from)).lt("created_at", iso(range.to)).limit(10000),
      supabase.rpc("revenue_by_source", { p_from: iso(range.from), p_to: iso(range.to) }),
    ]);
    const spendCents = (spend ?? []).reduce((a, x) => a + x.amount_cents, 0);
    const isAd = (s: string) => (AD_SOURCES as readonly string[]).includes(s);
    const leads = (contacts ?? []).filter((c) => isAd(c.source)).length;
    const adOpps = (opps ?? []).filter((o) => isAd(o.source));
    const won = adOpps.filter((o) => (o.pipeline_stages as unknown as { kind: string } | null)?.kind === "won").length;
    const revRows = (rev.data ?? []) as { source: string; customers: number; collected_net_cents: number }[];
    const attributed = revRows.filter((r) => isAd(r.source)).reduce((a, r) => a + Number(r.collected_net_cents), 0);
    const k = marketingKpis({
      spendCents, leads, attributedNetCents: attributed, opportunities: adOpps.length, won,
      impressions: (spend ?? []).reduce((a, x) => a + (x.impressions ?? 0), 0) || undefined, clicks: (spend ?? []).reduce((a, x) => a + (x.clicks ?? 0), 0) || undefined,
    });
    body = (
      <div className="space-y-6">
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">{t.analytics.metaPending}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t.analytics.spend} value={formatEuro(spendCents)} />
          <Kpi label={t.analytics.leads} value={formatNumber(leads)} sub={k.cplCents != null ? `${t.analytics.cpl}: ${formatEuro(k.cplCents)}` : t.analytics.roasNA} />
          <Kpi label={t.analytics.attributed} value={formatEuro(attributed)} />
          <Kpi label={t.analytics.roas} value={k.roas != null ? `${String(k.roas).replace(".", ",")}×` : "—"} sub={k.roas != null ? t.analytics.roasHint : t.analytics.roasNA} />
        </div>
        <Card><h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.analytics.funnel}</h2>
          <ul className="divide-y divide-border text-sm">
            <li className="flex justify-between px-4 py-2.5"><span>{t.analytics.leads}</span><span className="font-medium">{leads}</span></li>
            <li className="flex justify-between px-4 py-2.5"><span>{t.analytics.opportunities}</span><span className="font-medium">{adOpps.length}</span></li>
            <li className="flex justify-between px-4 py-2.5"><span>{t.analytics.won}</span><span className="font-medium">{won}{k.conversion != null ? ` · ${pct(k.conversion)} ${t.analytics.conversion.toLowerCase()}` : ""}</span></li>
          </ul></Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.analytics.revenueBySource}</h2>
            {revRows.length ? <ul className="divide-y divide-border">{revRows.map((r) => <li key={r.source} className="flex justify-between px-4 py-2.5 text-sm"><span>{t.sources[r.source as keyof typeof t.sources] ?? r.source}<span className="ml-2 text-xs text-muted">{r.customers} {t.analytics.customersCount.toLowerCase()}</span></span><span className="font-medium">{formatEuro(Number(r.collected_net_cents))}</span></li>)}</ul> : <EmptyState title={t.analytics.noData} />}</Card>
          <Card><h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.analytics.spendList}</h2>
            {spend?.length ? <ul className="divide-y divide-border">{spend.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{t.analytics.platforms[x.platform as keyof typeof t.analytics.platforms]}{x.campaign ? ` · ${x.campaign}` : ""}<span className="block text-xs text-muted">{formatDate(x.period_start)} – {formatDate(x.period_end)}</span></span>
                <span className="flex items-center gap-2"><span className="font-medium">{formatEuro(x.amount_cents)}</span>
                  {spendAllowed && <form action={deleteSpend.bind(null, x.id)}><button aria-label={t.common.delete} className="text-xs text-muted hover:text-brand">✕</button></form>}</span></li>))}</ul> : <EmptyState title={t.analytics.spendEmpty} />}</Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t.analytics.title} actions={actions} />
      <Tabs items={tabs} />
      <RangeBar base="/analytics" range={range} keep={{ tab }} />
      {body}
    </>
  );
}
