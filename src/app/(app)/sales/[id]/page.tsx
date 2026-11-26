import type { OppKind } from "@/lib/pipelines";
import { Updates } from "@/components/updates";
import { centsToField } from "@/lib/money";
import { InlineField } from "@/components/inline-field";
import { ActionMenu, menuItemClass } from "@/components/action-menu";
import Link from "@/components/nav-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/forms";
import { Thread } from "@/components/thread";
import { Quotes } from "@/components/quotes";
import { EditOpportunityButton } from "@/components/opportunity-form";
import { StageSelect } from "@/components/stage-select";
import { NewTaskButton } from "@/components/tasks";
import { TaskList, type TaskItem } from "@/components/task-list";
import { RecordPaymentButton } from "@/components/finance-forms";
import { deleteOpportunity, duplicateOpportunity } from "@/lib/actions/sales";
import { loadPeople } from "@/lib/people";
import { buildThread } from "@/lib/thread";
import { staleness } from "@/lib/staleness";
import { opportunityCollectedCents, outstandingCents, type PaymentRow } from "@/lib/finance";
import { dealTitle, romeToday, formatDate, formatEuro, humanizeKey } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { Activity, Doc, Note } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children || "—"}</dd></div>;
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  const finance = can(me.role, "payments.record");
  const supabase = await createClient();

  const { data: o } = await supabase.from("opportunities")
    .select("*,pipeline_stages(name,kind),contacts(id,display_name),companies(id,name),bookings(id,source,paid_cents)").eq("id", id).maybeSingle();
  if (!o) notFound();
  const booking = o.bookings as unknown as { id: string; source: string; paid_cents: number } | null;
  const stage = o.pipeline_stages as unknown as { name: string; kind: string };
  const contact = o.contacts as unknown as { id: string; display_name: string } | null;
  const company = o.companies as unknown as { id: string; name: string } | null;
  const base = `/sales/${id}`;
  const value = o.agreed_value_cents ?? o.expected_value_cents;
  const vatC = o.vat_cents ?? 0;

  const [people, typesRes, stagesRes, companiesRes, notesRes, docsRes, tasksRes, actsRes, paysRes, servicesRes] = await Promise.all([
    loadPeople(supabase),
    supabase.from("opportunities").select("event_type").not("event_type", "is", null).limit(1000),
    supabase.from("pipeline_stages").select("id,name,kind").eq("pipeline_id", o.pipeline_id).order("position"),
    supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
    supabase.from("notes").select("id,body,author_id,created_at").eq("opportunity_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("id,title,category,url,storage_path,created_at").eq("opportunity_id", id).not("url", "is", null).order("created_at", { ascending: false }),
    supabase.from("tasks").select("id,title,due_date,priority,done_at,assigned_to").eq("opportunity_id", id).order("due_date", { nullsFirst: false }),
    supabase.from("activities").select("id,type,summary,created_at,actor_id").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(100),
    finance ? supabase.from("payments").select("id,kind,amount_cents,vat_rate,method,paid_at,reference,source").eq("opportunity_id", id).order("paid_at", { ascending: false }) : Promise.resolve({ data: [] }),
    finance ? supabase.from("services").select("id,name,vat_rate").eq("active", true).order("name") : Promise.resolve({ data: [] }),
  ]);
  const eventTypes = [...new Set([...(typesRes.data ?? []).map((x) => x.event_type as string), ...(o.event_type ? [o.event_type] : [])])].sort((a, b) => a.localeCompare(b));
  const team = Object.entries(people).map(([pid, name]) => ({ id: pid, name }));
  const canModerate = can(me.role, "contacts.archive");
  const taskItems: TaskItem[] = (tasksRes.data ?? []).map((x) => ({ ...x, assigned_name: people[x.assigned_to ?? ""] }));
  const pays = (paysRes.data ?? []) as (PaymentRow & { id: string; reference: string | null; source: string })[];
  const collected = finance ? opportunityCollectedCents(pays, booking) : 0;
  const td = romeToday(); const todayIso = `${td.y}-${String(td.m).padStart(2, "0")}-${String(td.d).padStart(2, "0")}`;
  const hoursVal = o.duration_minutes ? String(o.duration_minutes / 60).replace(".", ",") : "";
  const sourceKeys: string[] = [...t.sourceOptions]; if (o.source !== "unknown" && !sourceKeys.includes(o.source)) sourceKeys.push(o.source);
  const sourceKey: string = o.source;
  const thread = buildThread({ notes: [], payments: pays, activities: (actsRes.data ?? []) as Activity[] });
  const stale = stage.kind === "open" ? staleness(o.last_contact_at) : null;

  return (
    <>
      <PageHeader back={{ href: "/sales", label: t.sales.title }} title={dealTitle(company?.name, contact?.display_name, o.name)}
        actions={<>
          <EditOpportunityButton companies={companiesRes.data ?? []}
            def={{ id, name: o.name, kind: o.kind as OppKind, contact: contact ? { id: contact.id, name: contact.display_name } : null, company_id: o.company_id, value_cents: value, vat_cents: o.vat_cents,
              attendees: o.attendees, event_date: o.event_date, event_type: o.event_type }} />
          <ActionMenu><form action={duplicateOpportunity.bind(null, id)}><button type="submit" className={menuItemClass}>{t.sales.duplicate}</button></form>{canModerate && <ConfirmButton menu label={t.common.delete} title={t.sales.deleteTitle} body={t.sales.deleteBody} action={deleteOpportunity.bind(null, id)} />}</ActionMenu>
        </>} />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-3 text-sm text-muted">
        {booking && <Link href={`/bookings/${booking.id}`} className="underline">{t.sales.fromBooking}</Link>}
        <StageSelect individual={o.kind === "individual"} id={id} name={o.name} totalCents={value} canPay={finance} stages={(stagesRes.data ?? []) as { id: string; name: string; kind: string }[]} current={o.stage_id} />
        {stale && <Badge tone={stale === "late" ? "brand" : "warning"}>{t.detail.stale[stale]}</Badge>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <dl>
              <Row label={t.sales.contact}>{contact && <Link className="underline" href={`/contacts/${contact.id}`}>{contact.display_name}</Link>}</Row>
              <Row label={t.sales.company}>{company && <Link className="underline" href={`/companies/${company.id}`}>{company.name}</Link>}</Row>
              <InlineField id={id} field="kind" label={t.sales.kind} type="select" value={o.kind}
                options={(Object.keys(t.sales.kinds) as OppKind[]).map((k) => ({ value: k, label: t.sales.kinds[k] }))} display={t.sales.kinds[o.kind as OppKind]} />
              <InlineField id={id} field="expected_value" label={`${t.sales.value} (${t.money.net})`} type="text" inputMode="decimal" placeholder="0,00" value={value != null ? centsToField(value - vatC) : ""} display={value != null ? formatEuro(value - vatC) : null} />
              <InlineField id={id} field="vat" label={o.kind === "individual" ? t.money.vat : `${t.money.vat} 22%`} type="text" inputMode="decimal" placeholder="0,00" value={value != null ? centsToField(vatC) : ""} display={value != null ? formatEuro(vatC) : null} />
              {value != null && <Row label={t.money.total}>{formatEuro(value)}</Row>}
              {finance && value != null && value > 0 && <Row label={t.sales.collected}>{formatEuro(collected)} <span className="font-normal text-muted">· {t.sales.outstanding.toLowerCase()} {formatEuro(outstandingCents(value, collected))}</span></Row>}
              <InlineField id={id} field="event_type" label={t.sales.eventType} type="combo" options={eventTypes.map((v) => ({ value: v, label: humanizeKey(v) ?? v }))} value={o.event_type ?? ""} display={humanizeKey(o.event_type)} />
              <InlineField id={id} field="event_date" label={t.sales.eventDate} type="date" value={o.event_date ?? ""} display={o.event_date ? formatDate(o.event_date) : null} />
              <InlineField id={id} field="attendees" label={t.sales.attendees} inputMode="numeric" value={o.attendees != null ? String(o.attendees) : ""} display={o.attendees} />
              <InlineField id={id} field="source" label={t.sales.sourceLabel} type="select" value={sourceKey}
                options={[{ value: "unknown", label: t.sources.unknown }, ...sourceKeys.map((k) => ({ value: k, label: t.sources[k as keyof typeof t.sources] ?? k }))]}
                display={t.sources[o.source as keyof typeof t.sources] ?? o.source} />
              <InlineField id={id} field="duration" label={t.detail.duration} inputMode="decimal" placeholder="2,5" value={hoursVal} display={hoursVal ? `${hoursVal} ${t.detail.hours}` : null} />
              <Row label={t.sales.created}>{formatDate(o.created_at)}</Row>
              {o.lost_reason && <Row label={t.sales.lostReason}>{o.lost_reason}</Row>}
            </dl>
          </Card>
          <Quotes opportunityId={id} docs={(docsRes.data ?? []) as Doc[]} />
          <Thread composer={false} parent={{ opportunity_id: id }} items={thread} people={people} userId={me.id} canModerate={canModerate}
            actions={finance ? <RecordPaymentButton variant="secondary" services={(servicesRes.data ?? []).map((s) => ({ ...s, vat_rate: Number(s.vat_rate) }))}
              preset={{ noVat: o.kind === "individual", contact: contact ? { id: contact.id, name: contact.display_name } : null, opportunity_id: id }} /> : undefined} />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{t.tasks.title}</h2>
            <NewTaskButton revalidate={base} link={{ opportunity_id: id }} team={team} me={me.id} variant="secondary" label={t.tasks.followUp} /></div>
          {taskItems.length ? <TaskList tasks={taskItems} path={base} /> : <Card><EmptyState title={t.tasks.empty} /></Card>}
          <Updates opportunityId={id} items={(notesRes.data ?? []) as Note[]} people={people} userId={me.id} canModerate={canModerate} today={todayIso} />
        </div>
      </div>
    </>
  );
}
