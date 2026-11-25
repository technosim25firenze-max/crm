import Link from "@/components/nav-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { ConfirmButton } from "@/components/forms";
import { DocumentsPanel, NotesPanel, Timeline } from "@/components/panels";
import { EditOpportunityButton } from "@/components/opportunity-form";
import { StageSelect } from "@/components/stage-select";
import { NewTaskButton } from "@/components/tasks";
import { TaskList, type TaskItem } from "@/components/task-list";
import { RecordPaymentButton } from "@/components/finance-forms";
import { deleteOpportunity } from "@/lib/actions/sales";
import { loadPeople, signDocuments } from "@/lib/people";
import { outstandingCents, summarizePayments, type PaymentRow } from "@/lib/finance";
import { formatDate, formatDateTime, formatEuro } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { Activity, Doc, Note } from "@/lib/types";

type Tab = "overview" | "notes" | "documents" | "payments" | "activity";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children || "—"}</dd></div>;
}

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getProfile();
  const finance = can(me.role, "payments.record");
  const tab: Tab = (["notes", "documents", "payments", "activity"] as const).find((x) => x === sp.tab && (x !== "payments" || finance)) ?? "overview";
  const supabase = await createClient();

  const { data: o } = await supabase.from("opportunities")
    .select("*,pipelines(kind,name),pipeline_stages(name,kind),contacts(id,display_name),companies(id,name)").eq("id", id).maybeSingle();
  if (!o) notFound();
  const kind = (o.pipelines as unknown as { kind: "b2b" | "b2c" }).kind;
  const stage = o.pipeline_stages as unknown as { name: string; kind: string };
  const contact = o.contacts as unknown as { id: string; display_name: string } | null;
  const company = o.companies as unknown as { id: string; name: string } | null;
  const [people, stagesRes, companiesRes] = await Promise.all([
    loadPeople(supabase),
    supabase.from("pipeline_stages").select("id,name,kind").eq("pipeline_id", o.pipeline_id).order("position"),
    supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
  ]);
  const team = Object.entries(people).map(([pid, name]) => ({ id: pid, name }));
  const canModerate = can(me.role, "contacts.archive");
  const base = `/sales/${id}`;
  const available: Tab[] = finance ? ["overview", "notes", "documents", "payments", "activity"] : ["overview", "notes", "documents", "activity"];

  let body: React.ReactNode;
  if (tab === "overview") {
    const [{ data: history }, { data: tasks }] = await Promise.all([
      supabase.from("opportunity_stage_history").select("id,changed_at,changed_by,from:from_stage_id(name),to:to_stage_id(name)").eq("opportunity_id", id).order("changed_at"),
      supabase.from("tasks").select("id,title,due_date,priority,done_at,assigned_to").eq("opportunity_id", id).order("due_date", { nullsFirst: false }),
    ]);
    const taskItems: TaskItem[] = (tasks ?? []).map((x) => ({ ...x, assigned_name: people[x.assigned_to ?? ""] }));
    const days = Math.max(0, Math.round(((o.closed_at ? new Date(o.closed_at) : new Date()).getTime() - new Date(o.created_at).getTime()) / 86400000));
    body = (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <dl>
              <Row label={t.sales.contact}>{contact && <Link className="underline" href={`/contacts/${contact.id}`}>{contact.display_name}</Link>}</Row>
              <Row label={t.sales.company}>{company && <Link className="underline" href={`/companies/${company.id}`}>{company.name}</Link>}</Row>
              <Row label={t.sales.value}>{o.expected_value_cents != null ? formatEuro(o.expected_value_cents) : null}</Row>
              <Row label={t.sales.agreed}>{o.agreed_value_cents != null ? formatEuro(o.agreed_value_cents) : null}</Row>
              <Row label={t.sales.probability}>{o.probability != null ? `${o.probability}%` : null}</Row>
              <Row label={t.sales.eventType}>{o.event_type}</Row>
              <Row label={t.sales.eventDate}>{o.event_date ? formatDate(o.event_date) : null}</Row>
              <Row label={t.sales.attendees}>{o.attendees}</Row>
              <Row label={t.sales.closeDate}>{o.expected_close_date ? formatDate(o.expected_close_date) : null}</Row>
              <Row label={t.sales.owner}>{people[o.owner_id ?? ""]}</Row>
              <Row label={t.sales.sourceLabel}>{t.sources[o.source as keyof typeof t.sources] ?? o.source}</Row>
              <Row label={t.sales.cycle}>{days} {t.sales.daysOpen}</Row>
              {o.lost_reason && <Row label={t.sales.lostReason}>{o.lost_reason}</Row>}
            </dl>
            {stage.kind === "won" && <p className="mt-3 text-xs text-muted">{t.sales.wonNote}</p>}
          </Card>
          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.sales.history}</h2>
            <ol className="divide-y divide-border">
              {(history ?? []).map((h) => {
                const from = h.from as unknown as { name: string } | null, to = h.to as unknown as { name: string } | null;
                return <li key={h.id} className="flex justify-between gap-4 px-4 py-2.5 text-sm"><span>{from ? `${from.name} → ${to?.name}` : `${t.sales.stage}: ${to?.name}`}</span><span className="text-xs text-muted">{t.sales.by} {people[h.changed_by ?? ""] ?? "—"} · {formatDateTime(h.changed_at)}</span></li>;
              })}
            </ol>
          </Card>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{t.tasks.title}</h2>
            <NewTaskButton revalidate={base} link={{ opportunity_id: id }} team={team} me={me.id} variant="secondary" label={t.tasks.followUp} /></div>
          {taskItems.length ? <TaskList tasks={taskItems} path={base} /> : <Card><EmptyState title={t.tasks.empty} /></Card>}
        </div>
      </div>
    );
  } else if (tab === "notes") {
    const { data } = await supabase.from("notes").select("id,body,author_id,created_at").eq("opportunity_id", id).order("created_at", { ascending: false });
    body = <NotesPanel parent={{ opportunity_id: id }} notes={(data ?? []) as Note[]} people={people} userId={me.id} canModerate={canModerate} />;
  } else if (tab === "documents") {
    const { data } = await supabase.from("documents").select("id,title,category,url,storage_path,created_at").eq("opportunity_id", id).order("created_at", { ascending: false });
    const docs = (data ?? []) as Doc[];
    body = <DocumentsPanel parent={{ opportunity_id: id }} docs={docs} signed={await signDocuments(supabase, docs)} canModerate={canModerate} />;
  } else if (tab === "payments") {
    const [{ data: pays }, { data: services }] = await Promise.all([
      supabase.from("payments").select("id,kind,amount_cents,vat_rate,method,paid_at,reference").eq("opportunity_id", id).order("paid_at", { ascending: false }),
      supabase.from("services").select("id,name,vat_rate").eq("active", true).order("name"),
    ]);
    const rows = (pays ?? []) as (PaymentRow & { id: string; reference: string | null })[];
    const collected = summarizePayments(rows).grossCents;
    const agreed = o.agreed_value_cents ?? 0;
    body = (
      <div className="space-y-4">
        <Card className="grid gap-4 p-4 sm:grid-cols-3">
          <div><p className="text-[13px] text-muted">{t.sales.agreed}</p><p className="text-lg font-semibold">{formatEuro(agreed)}</p></div>
          <div><p className="text-[13px] text-muted">{t.sales.collected}</p><p className="text-lg font-semibold">{formatEuro(collected)}</p></div>
          <div><p className="text-[13px] text-muted">{t.sales.outstanding}</p><p className="text-lg font-semibold">{formatEuro(outstandingCents(agreed, collected))}</p></div>
        </Card>
        <div className="flex justify-end">
          <RecordPaymentButton services={(services ?? []).map((s) => ({ ...s, vat_rate: Number(s.vat_rate) }))}
            preset={{ contact: contact ? { id: contact.id, name: contact.display_name } : null, opportunity_id: id }} />
        </div>
        <Card>
          {rows.length ? (
            <ul className="divide-y divide-border">
              {rows.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{p.kind === "refund" ? t.finance.kindRefund : t.finance.kindPayment} · {t.finance.methods[p.method as keyof typeof t.finance.methods]}<span className="block text-xs text-muted">{formatDateTime(p.paid_at)}{p.reference ? ` · ${p.reference}` : ""}</span></span>
                  <span className={p.kind === "refund" ? "text-brand" : "font-medium"}>{p.kind === "refund" ? "−" : ""}{formatEuro(p.amount_cents)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t.finance.emptyPayments} />}
        </Card>
      </div>
    );
  } else {
    const { data } = await supabase.from("activities").select("id,type,summary,created_at,actor_id").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(100);
    body = <Timeline items={(data ?? []) as Activity[]} people={people} />;
  }

  return (
    <>
      <PageHeader title={o.name}
        actions={<>
          <EditOpportunityButton kind={kind} companies={companiesRes.data ?? []}
            def={{ id, name: o.name, contact: contact ? { id: contact.id, name: contact.display_name } : null, company_id: o.company_id, expected_value_cents: o.expected_value_cents, agreed_value_cents: o.agreed_value_cents,
              probability: o.probability, attendees: o.attendees, expected_close_date: o.expected_close_date, event_date: o.event_date, event_type: o.event_type, closed: !!o.closed_at && stage.kind === "won" }} />
          {canModerate && <ConfirmButton label={t.common.delete} title={t.sales.deleteTitle} body={t.sales.deleteBody} action={deleteOpportunity.bind(null, id)} />}
        </>} />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-3 text-sm text-muted">
        <Badge>{t.sales[kind]}</Badge>
        <Badge tone={stage.kind === "won" ? "success" : stage.kind === "lost" ? "brand" : "neutral"}>{stage.name}</Badge>
        <StageSelect id={id} stages={(stagesRes.data ?? []) as { id: string; name: string; kind: string }[]} current={o.stage_id} />
      </div>
      <Tabs items={available.map((k) => ({ href: k === "overview" ? base : `${base}?tab=${k}`, label: t.sales.tabs[k], active: tab === k }))} />
      {body}
    </>
  );
}
