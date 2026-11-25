import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { RangeBar } from "@/components/range-bar";
import { BarsChart } from "@/components/charts";
import { LinkContactButton } from "@/components/booking-forms";
import { NewExpenseButton, RecordPaymentButton, RefundButton } from "@/components/finance-forms";
import { deleteExpense, setExpensePaid, setReconciled } from "@/lib/actions/finance";
import { previousRange, resolveRange } from "@/lib/dates";
import { bookingOutstandingCents, contributionMarginCents, growthPercent, outstandingCents, summarizeExpenses, summarizePayments, type PaymentRow } from "@/lib/finance";
import { formatDate, formatDateTime, formatEuro, formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.finance.title };

type Search = { tab?: string; range?: string; from?: string; to?: string };
type PayRow = PaymentRow & { id: string; refund_of: string | null; reference: string | null; reconciled: boolean; contact_id: string | null; contacts: { display_name: string } | null; booking_id: string | null };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="p-4"><p className="text-[13px] text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="mt-1 text-xs text-muted">{sub}</p>}</Card>;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("finance.view");
  const sp = await searchParams;
  const tab = sp.tab === "payments" || sp.tab === "expenses" ? sp.tab : "summary";
  const range = resolveRange(sp);
  const prev = previousRange(range);
  const supabase = await createClient();
  const keep: Record<string, string> = { tab };

  const [{ data: payData }, { data: prevData }, { data: expData }, { data: services }, { data: categories }] = await Promise.all([
    supabase.from("payments").select("id,kind,refund_of,amount_cents,vat_rate,method,paid_at,reference,reconciled,contact_id,booking_id,contacts(display_name)")
      .gte("paid_at", range.from.toISOString()).lt("paid_at", range.to.toISOString()).order("paid_at", { ascending: false }).limit(2000),
    supabase.from("payments").select("kind,amount_cents,vat_rate,method,paid_at").gte("paid_at", prev.from.toISOString()).lt("paid_at", prev.to.toISOString()).limit(5000),
    supabase.from("expenses").select("id,spent_on,supplier,description,net_cents,vat_cents,total_cents,payment_status,expense_categories(name,kind)")
      .gte("spent_on", range.fromStr).lte("spent_on", range.toStr).order("spent_on", { ascending: false }).limit(1000),
    supabase.from("services").select("id,name,vat_rate").eq("active", true).order("name"),
    supabase.from("expense_categories").select("id,name").order("name"),
  ]);
  const pays = (payData ?? []).map((p) => ({ ...p, contacts: p.contacts as unknown as { display_name: string } | null })) as PayRow[];
  const exps = (expData ?? []).map((e) => ({ ...e, cat: e.expense_categories as unknown as { name: string; kind: "fixed" | "variable" } | null }));
  const sum = summarizePayments(pays);
  const prevSum = summarizePayments((prevData ?? []) as PaymentRow[]);
  const expSum = summarizeExpenses(exps.map((e) => ({ net_cents: e.net_cents, vat_cents: e.vat_cents, category_kind: e.cat?.kind })));
  const growth = growthPercent(sum.netCents, prevSum.netCents);
  const svc = (services ?? []).map((s) => ({ ...s, vat_rate: Number(s.vat_rate) }));
  const tabs = (["summary", "payments", "expenses"] as const).map((k) => ({ href: `/finance?${new URLSearchParams({ tab: k, range: range.key, ...(range.key === "custom" ? { from: range.fromStr, to: range.toStr } : {}) })}`, label: t.finance.tabs[k], active: tab === k }));

  let actions: React.ReactNode = <RecordPaymentButton services={svc} />;
  let body: React.ReactNode;

  if (tab === "summary") {
    // Residui: trattative acquisite e prenotazioni non annullate.
    const [{ data: won }, { data: bks }] = await Promise.all([
      supabase.from("opportunities").select("id,name,agreed_value_cents,pipeline_stages!inner(kind)").eq("pipeline_stages.kind", "won").gt("agreed_value_cents", 0).limit(500),
      supabase.from("bookings").select("id,customer_name,starts_at,total_cents,paid_cents,status,source").eq("is_test", false).in("status", ["pending", "confirmed", "completed"]).gt("total_cents", 0).limit(500),
    ]);
    const oppIds = (won ?? []).map((o) => o.id), bkIds = (bks ?? []).map((b) => b.id);
    const [{ data: op }, { data: bp }] = await Promise.all([
      oppIds.length ? supabase.from("payments").select("opportunity_id,kind,amount_cents").in("opportunity_id", oppIds) : Promise.resolve({ data: [] as { opportunity_id: string; kind: string; amount_cents: number }[] }),
      bkIds.length ? supabase.from("payments").select("booking_id,kind,amount_cents").eq("source", "manual").in("booking_id", bkIds) : Promise.resolve({ data: [] as { booking_id: string; kind: string; amount_cents: number }[] }),
    ]);
    const net = (rows: { kind: string; amount_cents: number }[]) => rows.reduce((a, r) => a + (r.kind === "refund" ? -1 : 1) * r.amount_cents, 0);
    const outstanding = [
      ...(won ?? []).map((o) => ({ key: `o${o.id}`, href: `/sales/${o.id}`, label: o.name, kind: "Trattativa", due: outstandingCents(o.agreed_value_cents, net((op ?? []).filter((x) => x.opportunity_id === o.id))) })),
      ...(bks ?? []).map((b) => ({ key: `b${b.id}`, href: `/bookings/${b.id}`, label: `${b.customer_name ?? "—"} · ${formatDate(b.starts_at)}`, kind: t.finance.booking, due: bookingOutstandingCents(b.total_cents, b.source === "manual" ? 0 : b.paid_cents, net((bp ?? []).filter((x) => x.booking_id === b.id))) })),
    ].filter((x) => x.due > 0).sort((a, b) => b.due - a.due);
    const outstandingTotal = outstanding.reduce((a, x) => a + x.due, 0);

    const daily = range.to.getTime() - range.from.getTime() <= 45 * 86400000;
    const chart = Object.entries(daily ? sum.byDay : sum.byMonth).sort().map(([k, v]) => ({ label: daily ? `${k.slice(8)}/${k.slice(5, 7)}` : `${k.slice(5)}/${k.slice(2, 4)}`, value: v }));
    const byCat = new Map<string, number>();
    exps.forEach((e) => byCat.set(e.cat?.name ?? t.finance.noCategory, (byCat.get(e.cat?.name ?? t.finance.noCategory) ?? 0) + e.net_cents));

    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t.finance.collectedNet} value={formatEuro(sum.netCents)} sub={`${t.finance.gross} ${formatEuro(sum.grossCents)} · ${t.finance.vat} ${formatEuro(sum.vatCents)}${growth != null ? ` · ${growth > 0 ? "+" : ""}${String(growth).replace(".", ",")}% ${t.ranges.vsPrev}` : ""}`} />
          <Kpi label={t.finance.count} value={formatNumber(sum.count)} sub={`${t.finance.avgTicket}: ${formatEuro(sum.averageGrossCents)}`} />
          <Kpi label={t.finance.outstanding} value={formatEuro(outstandingTotal)} sub={`${formatNumber(outstanding.length)} ${t.finance.items}`} />
          <Kpi label={t.finance.margin} value={formatEuro(contributionMarginCents(sum.netCents, expSum.netCents))} sub={`${t.finance.expensesTotal}: ${formatEuro(expSum.netCents)}`} />
        </div>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.finance.trend}</h2>
          {chart.length ? <BarsChart data={chart} euro /> : <EmptyState title={t.analytics.noData} />}
          <p className="mt-2 text-xs text-muted">{t.finance.marginHint}</p>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.finance.byMethod}</h2>
            {Object.keys(sum.byMethod).length ? (
              <ul className="divide-y divide-border">{Object.entries(sum.byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => (
                <li key={m} className="flex justify-between px-4 py-2.5 text-sm"><span>{t.finance.methods[m as keyof typeof t.finance.methods]}</span><span className="font-medium">{formatEuro(v)}</span></li>))}
              </ul>
            ) : <EmptyState title={t.analytics.noData} />}
            {sum.refundsGrossCents > 0 && <p className="border-t border-border px-4 py-2.5 text-xs text-muted">{t.finance.refunds}: {formatEuro(sum.refundsGrossCents)}</p>}
          </Card>
          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.finance.outstanding}</h2>
            {outstanding.length ? (
              <ul className="divide-y divide-border">{outstanding.slice(0, 8).map((x) => (
                <li key={x.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0"><Link href={x.href} className="font-medium hover:underline">{x.label}</Link><span className="block text-xs text-muted">{x.kind}</span></span>
                  <span className="font-medium">{formatEuro(x.due)}</span></li>))}
              </ul>
            ) : <EmptyState title={t.finance.nothingOutstanding} hint={t.finance.outstandingHint} />}
          </Card>
        </div>
        {byCat.size > 0 && (
          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.finance.expensesByCategory}</h2>
            <ul className="divide-y divide-border">{[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => (
              <li key={n} className="flex justify-between px-4 py-2.5 text-sm"><span>{n}</span><span className="font-medium">{formatEuro(v)}</span></li>))}
            </ul>
          </Card>
        )}
      </div>
    );
  } else if (tab === "payments") {
    const refunded = new Map<string, number>();
    pays.filter((p) => p.kind === "refund" && p.refund_of).forEach((p) => refunded.set(p.refund_of!, (refunded.get(p.refund_of!) ?? 0) + p.amount_cents));
    body = (
      <Card className="overflow-x-auto">
        {pays.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[13px] text-muted"><tr>{[t.finance.paidAt, t.finance.contact, t.finance.method, t.finance.gross, t.finance.net, ""].map((h, i) => <th key={i} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {pays.map((p) => {
                const sign = p.kind === "refund" ? -1 : 1;
                const left = p.amount_cents - (refunded.get(p.id) ?? 0);
                return (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(p.paid_at)}</td>
                    <td className="px-4 py-3">{p.contact_id ? <Link className="font-medium hover:underline" href={`/contacts/${p.contact_id}`}>{p.contacts?.display_name}</Link> : <LinkContactButton entity="payment" id={p.id} />}
                      {p.reference && <span className="block text-xs text-muted">{p.reference}</span>}</td>
                    <td className="px-4 py-3"><span className="mr-1.5">{t.finance.methods[p.method as keyof typeof t.finance.methods]}</span>{p.kind === "refund" && <Badge tone="brand">{t.finance.kindRefund}</Badge>}{(refunded.get(p.id) ?? 0) > 0 && <Badge tone="warning">{t.finance.refunded}</Badge>}</td>
                    <td className={`whitespace-nowrap px-4 py-3 font-medium ${sign < 0 ? "text-brand" : ""}`}>{sign < 0 ? "−" : ""}{formatEuro(p.amount_cents)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{sign < 0 ? "−" : ""}{formatEuro(Math.round(p.amount_cents / (1 + p.vat_rate / 100)))}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <form action={setReconciled.bind(null, p.id, !p.reconciled)}><button title={p.reconciled ? t.finance.unreconcile : t.finance.reconcile} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background">{p.reconciled ? `✓ ${t.finance.reconciled}` : t.finance.reconcile}</button></form>
                        {p.kind === "payment" && left > 0 && <RefundButton paymentId={p.id} remaining={(left / 100).toFixed(2).replace(".", ",")} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyState title={t.finance.emptyPayments} hint={t.finance.emptyPaymentsHint} />}
      </Card>
    );
  } else {
    actions = <NewExpenseButton categories={categories ?? []} />;
    body = (
      <Card className="overflow-x-auto">
        {exps.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[13px] text-muted"><tr>{[t.finance.date, t.finance.supplier, t.finance.category, t.finance.netAmount, t.finance.totalLabel, t.finance.status, ""].map((h, i) => <th key={i} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {exps.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(e.spent_on)}</td>
                  <td className="px-4 py-3">{e.supplier ?? "—"}{e.description && <span className="block text-xs text-muted">{e.description}</span>}</td>
                  <td className="px-4 py-3 text-muted">{e.cat?.name ?? "—"}{e.cat && <span className="ml-1 text-xs">({e.cat.kind === "fixed" ? t.finance.fixed : t.finance.variable})</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatEuro(e.net_cents)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{formatEuro(e.total_cents)}</td>
                  <td className="px-4 py-3"><Badge tone={e.payment_status === "paid" ? "success" : "warning"}>{e.payment_status === "paid" ? t.finance.paid : t.finance.unpaid}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {e.payment_status === "unpaid" && <form action={setExpensePaid.bind(null, e.id)} className="inline"><button className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background">{t.finance.markPaid}</button></form>}
                    <form action={deleteExpense.bind(null, e.id)} className="inline"><button className="rounded-md px-2 py-1 text-xs text-muted hover:text-brand">{t.common.delete}</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState title={t.finance.emptyExpenses} hint={t.finance.emptyExpensesHint} />}
        {exps.length > 0 && <p className="border-t border-border px-4 py-3 text-sm text-muted">{t.finance.expensesTotal}: <span className="font-medium text-foreground">{formatEuro(expSum.netCents)}</span> · {t.finance.fixed}: {formatEuro(expSum.fixedNetCents)} · {t.finance.variable}: {formatEuro(expSum.variableNetCents)}</p>}
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={t.finance.title} actions={actions} />
      <Tabs items={tabs} />
      <RangeBar base="/finance" range={range} keep={keep} />
      {body}
    </>
  );
}
