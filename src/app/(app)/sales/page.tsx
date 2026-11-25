import Link from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { Kanban, type KItem } from "@/components/kanban";
import { NewOpportunityButton } from "@/components/opportunity-form";
import { NewTaskButton } from "@/components/tasks";
import { TaskList, type TaskItem } from "@/components/task-list";
import { loadPeople } from "@/lib/people";
import { formatDate, formatEuro, formatNumber, romeToday } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.sales.title };

type Search = { tab?: string; view?: string; who?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = sp.tab === "b2c" || sp.tab === "tasks" ? sp.tab : "b2b";
  const me = await getProfile();
  const supabase = await createClient();
  const tabs = (["b2b", "b2c", "tasks"] as const).map((k) => ({ href: `/sales?tab=${k}`, label: t.sales[k], active: tab === k }));

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
        <PageHeader title={t.sales.title} actions={<NewTaskButton revalidate="/sales" team={team} me={me.id} />} />
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

  const view = sp.view === "list" ? "list" : "kanban";
  const { data: pipe } = await supabase.from("pipelines").select("id").eq("kind", tab).single();
  const [{ data: stages }, { data: opps }, { data: companies }, { data: overdueTasks }] = await Promise.all([
    supabase.from("pipeline_stages").select("id,name,kind,position").eq("pipeline_id", pipe?.id ?? "").order("position"),
    supabase.from("opportunities").select("id,name,stage_id,expected_value_cents,agreed_value_cents,expected_close_date,owner_id,contacts(display_name),companies(name)")
      .eq("pipeline_id", pipe?.id ?? "").order("updated_at", { ascending: false }).limit(500),
    supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
    supabase.from("tasks").select("opportunity_id").is("done_at", null).not("opportunity_id", "is", null).lt("due_date", (() => { const d = romeToday(); return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; })()),
  ]);
  const overdue = new Set((overdueTasks ?? []).map((x) => x.opportunity_id));
  const stageList = (stages ?? []) as { id: string; name: string; kind: "open" | "won" | "lost" }[];
  const kindOf = Object.fromEntries(stageList.map((s) => [s.id, s.kind]));
  const items: KItem[] = (opps ?? []).map((o) => {
    const c = o.contacts as unknown as { display_name: string } | null, co = o.companies as unknown as { name: string } | null;
    return { id: o.id, name: o.name, stage_id: o.stage_id, value_cents: o.agreed_value_cents ?? o.expected_value_cents, who: co?.name ?? c?.display_name ?? null, close: o.expected_close_date, overdue: overdue.has(o.id) };
  });
  const open = items.filter((i) => kindOf[i.stage_id] === "open");
  const openValue = open.reduce((a, i) => a + (i.value_cents ?? 0), 0);
  const viewLink = (v: string) => `/sales?tab=${tab}&view=${v}`;

  return (
    <>
      <PageHeader title={t.sales.title} actions={<NewOpportunityButton kind={tab} companies={companies ?? []} />} />
      <Tabs items={tabs} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{formatNumber(open.length)}</span> {t.sales.open.toLowerCase()} · {t.sales.pipelineValue}: <span className="font-medium text-foreground">{formatEuro(openValue)}</span>
        </p>
        <div className="flex gap-1 text-sm">
          {(["kanban", "list"] as const).map((v) => (
            <Link key={v} href={viewLink(v)} className={`rounded-lg px-3 py-1 ${view === v ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>{v === "kanban" ? t.sales.kanban : t.sales.list}</Link>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <Card><EmptyState title={t.sales.empty} hint={t.sales.emptyHint} /></Card>
      ) : view === "kanban" ? (
        <Kanban stages={stageList} initial={items} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[13px] text-muted">
              <tr>{[t.sales.name, t.sales.stage, t.sales.company, t.sales.value, t.sales.closeDate].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(opps ?? []).map((o) => {
                const st = stageList.find((s) => s.id === o.stage_id);
                const c = o.contacts as unknown as { display_name: string } | null, co = o.companies as unknown as { name: string } | null;
                return (
                  <tr key={o.id} className="hover:bg-background">
                    <td className="px-4 py-3"><Link href={`/sales/${o.id}`} className="font-medium hover:underline">{o.name}</Link></td>
                    <td className="px-4 py-3"><Badge tone={st?.kind === "won" ? "success" : st?.kind === "lost" ? "brand" : "neutral"}>{st?.name}</Badge></td>
                    <td className="px-4 py-3 text-muted">{co?.name ?? c?.display_name ?? "—"}</td>
                    <td className="px-4 py-3">{(o.agreed_value_cents ?? o.expected_value_cents) != null ? formatEuro((o.agreed_value_cents ?? o.expected_value_cents)!) : "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(o.expected_close_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
