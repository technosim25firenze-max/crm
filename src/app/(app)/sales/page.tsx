import { ClickRow } from "@/components/click-row";
import Link from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { Kanban, type KItem } from "@/components/kanban";
import { EditOpportunityButton, NewOpportunityButton } from "@/components/opportunity-form";
import { ActionMenu, menuItemClass } from "@/components/action-menu";
import { ConfirmButton } from "@/components/forms";
import { deleteOpportunity, duplicateOpportunity } from "@/lib/actions/sales";
import { NewTaskButton } from "@/components/tasks";
import { TaskList, type TaskItem } from "@/components/task-list";
import { loadPeople } from "@/lib/people";
import { staleness } from "@/lib/staleness";
import { opportunityCollectedCents } from "@/lib/finance";
import { PIPELINE_KIND, parseKind, type OppKind } from "@/lib/pipelines";
import { dealTitle, formatEuro, formatNumber, humanizeKey, romeToday } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.sales.title };

type Search = { tab?: string; view?: string; who?: string; kind?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = sp.tab === "tasks" ? "tasks" : "pipeline";
  const me = await getProfile();
  const supabase = await createClient();
  const tabs = (["pipeline", "tasks"] as const).map((k) => ({ href: `/sales?tab=${k}`, label: t.sales[k], active: tab === k }));

  if (tab === "tasks") {
    const people = await loadPeople(supabase);
    const who = sp.who === "all" ? "all" : "me";
    let q = supabase.from("tasks").select("id,title,due_date,priority,done_at,assigned_to,contact_id,opportunity_id,contacts(display_name),opportunities(name)")
      .order("due_date", { ascending: true, nullsFirst: false }).limit(300);
    if (who === "me") q = q.eq("assigned_to", me.id);
    const { data } = await q;
    const items: TaskItem[] = (data ?? []).map((x) => {
      const c = x.contacts as unknown as { display_name: string } | null, o = x.opportunities as unknown as { name: string } | null;
      return {
        id: x.id, title: x.title, due_date: x.due_date, priority: x.priority, done_at: x.done_at, assigned_name: people[x.assigned_to ?? ""],
        link: x.opportunity_id && o ? { href: `/sales/${x.opportunity_id}`, label: o.name } : x.contact_id && c ? { href: `/contacts/${x.contact_id}`, label: c.display_name } : null,
      };
    });
    const team = Object.entries(people).map(([id, name]) => ({ id, name }));
    return (
      <>
        <PageHeader title={t.sales.title} subtitle={t.sales.tasksHint} actions={<NewTaskButton revalidate="/sales" team={team} me={me.id} />} />
        <Tabs items={tabs} />
        <div className="mb-4 flex gap-2 text-sm">
          {(["me", "all"] as const).map((w) => (
            <Link key={w} href={`/sales?tab=tasks&who=${w}`} className={`rounded-full border px-3 py-1 ${who === w ? "border-foreground bg-foreground text-white" : "border-border text-muted hover:text-foreground"}`}>
              {w === "me" ? t.tasks.mine : t.tasks.everyone}
            </Link>
          ))}
        </div>
        <TaskList tasks={items} path="/sales" />
      </>
    );
  }

  const kind = parseKind(sp.kind);
  const view = sp.view === "list" ? "list" : "kanban";
  const finance = can(me.role, "payments.record");
  const canDelete = can(me.role, "contacts.archive");
  const { data: pipe } = await supabase.from("pipelines").select("id").eq("kind", PIPELINE_KIND[kind]).single();
  const [{ data: stages }, { data: opps }, { data: companies }, { data: overdueTasks }, { data: pays }] = await Promise.all([
    supabase.from("pipeline_stages").select("id,name,kind,position").eq("pipeline_id", pipe?.id ?? "").order("position"),
    (() => {
      return supabase.from("opportunities").select("id,name,kind,event_type,attendees,event_date,company_id,contact_id,last_contact_at,stage_id,expected_value_cents,agreed_value_cents,vat_cents,expected_close_date,owner_id,source,contacts(display_name),companies(name),bookings(source,paid_cents)")
        .eq("pipeline_id", pipe?.id ?? "").order("created_at", { ascending: false }).limit(500);
    })(),
    supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
    supabase.from("tasks").select("opportunity_id").is("done_at", null).not("opportunity_id", "is", null).lt("due_date", (() => { const d = romeToday(); return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; })()),
    // Gli incassi li vedono solo owner/admin (RLS): per gli altri la lista resta vuota e la scheda non mostra l'incassato.
    finance ? supabase.from("payments").select("opportunity_id,kind,amount_cents,source").not("opportunity_id", "is", null).limit(5000) : Promise.resolve({ data: null }),
  ]);
  const paysByOpp = new Map<string, { kind: string; amount_cents: number; source: string }[]>();
  (pays ?? []).forEach((p) => paysByOpp.set(p.opportunity_id as string, [...(paysByOpp.get(p.opportunity_id as string) ?? []), p as { kind: string; amount_cents: number; source: string }]));
  const overdue = new Set((overdueTasks ?? []).map((x) => x.opportunity_id));
  const stageList = (stages ?? []) as { id: string; name: string; kind: "open" | "won" | "lost" }[];
  const kindOf = Object.fromEntries(stageList.map((s) => [s.id, s.kind]));
  const menuFor = (o: NonNullable<typeof opps>[number], size?: "sm" | "md") => {
    const c = o.contacts as unknown as { display_name: string } | null;
    const bk = o.bookings as unknown as { source: string } | null;
    return (
      <ActionMenu size={size ?? "sm"}>
        <EditOpportunityButton menu companies={companies ?? []}
          def={{ id: o.id, name: o.name, kind: o.kind as OppKind, contact: o.contact_id && c ? { id: o.contact_id, name: c.display_name } : null, company_id: o.company_id,
            value_cents: o.agreed_value_cents ?? o.expected_value_cents, vat_cents: o.vat_cents, attendees: o.attendees, event_date: o.event_date, event_type: o.event_type, source: o.source }} />
        <form action={duplicateOpportunity.bind(null, o.id)}><button type="submit" className={menuItemClass}>{t.sales.duplicate}</button></form>
        {canDelete && !bk && <ConfirmButton menu label={t.common.delete} title={t.sales.deleteTitle} body={t.sales.deleteBody} action={deleteOpportunity.bind(null, o.id)} />}
      </ActionMenu>
    );
  };
  const items: KItem[] = (opps ?? []).map((o) => {
    const c = o.contacts as unknown as { display_name: string } | null, co = o.companies as unknown as { name: string } | null;
    const bk = o.bookings as unknown as { source: string; paid_cents: number } | null;
    return {
      id: o.id, menu: menuFor(o), name: dealTitle(co?.name, c?.display_name, o.name), event: humanizeKey(o.event_type), stage_id: o.stage_id, value_cents: o.agreed_value_cents ?? o.expected_value_cents, vat_cents: o.vat_cents,
      collected_cents: finance && (o.agreed_value_cents ?? 0) > 0 ? opportunityCollectedCents(paysByOpp.get(o.id) ?? [], bk) : null,
      overdue: overdue.has(o.id), stale: kindOf[o.stage_id] === "open" ? staleness(o.last_contact_at) : null,
    };
  });
  const open = items.filter((i) => kindOf[i.stage_id] === "open");
  const openValue = open.reduce((a, i) => a + Math.max(0, (i.value_cents ?? 0) - (i.vat_cents ?? 0)), 0);
  const link = (over: Record<string, string | null>) => {
    const q = new URLSearchParams(); const cur: Record<string, string | null> = { kind: kind === "individual" ? "individual" : null, view: view === "list" ? "list" : null, ...over };
    Object.entries(cur).forEach(([k, v]) => v && q.set(k, v));
    return `/sales${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title={t.sales.title} actions={<NewOpportunityButton companies={companies ?? []} kind={kind} />} />
      <Tabs items={tabs} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{formatNumber(open.length)}</span> {t.sales.open.toLowerCase()} · {t.sales.pipelineValue}: <span className="font-medium text-foreground">{formatEuro(openValue)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex gap-1">
            {(["event", "individual"] as const).map((k) => (
              <Link key={k} href={link({ kind: k === "individual" ? "individual" : null })} className={`rounded-full border px-3 py-1 ${kind === k ? "border-foreground bg-foreground text-white" : "border-border text-muted hover:text-foreground"}`}>{t.sales.kinds[k]}</Link>
            ))}
          </div>
          <div className="flex gap-1">
            {(["kanban", "list"] as const).map((v) => (
              <Link key={v} href={link({ view: v === "list" ? "list" : null })} className={`rounded-lg px-3 py-1 ${view === v ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>{v === "kanban" ? t.sales.kanban : t.sales.list}</Link>
            ))}
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <Card><EmptyState title={t.sales.empty} hint={t.sales.emptyHint} /></Card>
      ) : view === "kanban" ? (
        <Kanban stages={stageList} initial={items} canPay={finance} individual={kind === "individual"} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[13px] text-muted">
              <tr>{[t.sales.name, t.sales.stage, t.sales.company, t.sales.value].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}<th className="w-12" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(opps ?? []).map((o) => {
                const st = stageList.find((s) => s.id === o.stage_id);
                const c = o.contacts as unknown as { display_name: string } | null, co = o.companies as unknown as { name: string } | null;
                return (
                  <ClickRow key={o.id} href={`/sales/${o.id}`}>
                    <td className="px-4 py-3"><Link href={`/sales/${o.id}`} className="font-medium hover:underline">{dealTitle(co?.name, c?.display_name, o.name)}</Link>{o.event_type && <span className="block text-xs text-muted">{humanizeKey(o.event_type)}</span>}</td>
                    <td className="px-4 py-3"><Badge tone={st?.kind === "won" ? "success" : st?.kind === "lost" ? "brand" : "neutral"}>{st?.name}</Badge></td>
                    <td className="px-4 py-3 text-muted">{co?.name ?? c?.display_name ?? "—"}</td>
                    <td className="px-4 py-3">{(o.agreed_value_cents ?? o.expected_value_cents) != null ? formatEuro((o.agreed_value_cents ?? o.expected_value_cents)!) : "—"}</td>
                    <td className="px-2 py-2 text-right">{menuFor(o)}</td>
                  </ClickRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
