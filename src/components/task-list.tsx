import Link from "next/link";
import { Check, Trash2 } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { deleteTask, toggleTask } from "@/lib/actions/sales";
import { formatDate, romeToday } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export interface TaskItem {
  id: string; title: string; due_date: string | null; priority: string; done_at: string | null; assigned_name?: string;
  link?: { href: string; label: string } | null;
}

const ymd = () => { const d = romeToday(); return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; };

function Row({ task, path }: { task: TaskItem; path: string }) {
  const overdue = !task.done_at && task.due_date && task.due_date < ymd();
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <form action={toggleTask.bind(null, task.id, !task.done_at, path)}>
        <button aria-label={task.done_at ? t.tasks.reopen : t.tasks.complete} title={task.done_at ? t.tasks.reopen : t.tasks.complete}
          className={`flex h-5 w-5 items-center justify-center rounded-full border ${task.done_at ? "border-success bg-success text-white" : "border-border hover:border-foreground"}`}>
          {task.done_at && <Check size={12} />}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={task.done_at ? "text-muted line-through" : "font-medium"}>{task.title}</p>
        <p className="truncate text-xs text-muted">
          {task.assigned_name}{task.link && <> · <Link href={task.link.href} className="hover:underline">{task.link.label}</Link></>}
        </p>
      </div>
      {task.priority === "high" && !task.done_at && <Badge tone="warning">{t.tasks.priorities.high}</Badge>}
      {task.due_date && <span className={`text-xs ${overdue ? "font-medium text-brand" : "text-muted"}`}>{formatDate(task.due_date)}</span>}
      <form action={deleteTask.bind(null, task.id, path)}>
        <button aria-label={t.common.delete} className="rounded-md p-1.5 text-muted hover:bg-background hover:text-brand"><Trash2 size={14} /></button>
      </form>
    </li>
  );
}

/** Elenco attività raggruppato: in ritardo, oggi, in programma, senza scadenza, completate. */
export function TaskList({ tasks, path }: { tasks: TaskItem[]; path: string }) {
  if (!tasks.length) return <Card><EmptyState title={t.tasks.empty} hint={t.tasks.emptyHint} /></Card>;
  const today = ymd();
  const open = tasks.filter((x) => !x.done_at);
  const groups: [string, TaskItem[]][] = [
    [t.tasks.overdue, open.filter((x) => x.due_date && x.due_date < today)],
    [t.tasks.today, open.filter((x) => x.due_date === today)],
    [t.tasks.upcoming, open.filter((x) => x.due_date && x.due_date > today)],
    [t.tasks.noDate, open.filter((x) => !x.due_date)],
    [t.tasks.done, tasks.filter((x) => x.done_at).slice(0, 20)],
  ];
  return (
    <div className="space-y-4">
      {groups.filter(([, g]) => g.length).map(([label, g]) => (
        <Card key={label}>
          <h3 className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">{label} <span className="font-normal text-muted">({g.length})</span></h3>
          <ul className="divide-y divide-border">{g.map((x) => <Row key={x.id} task={x} path={path} />)}</ul>
        </Card>
      ))}
    </div>
  );
}
