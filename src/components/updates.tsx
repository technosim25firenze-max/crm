import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { UpdateForm } from "@/components/forms";
import { deleteNote } from "@/lib/actions/related";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/it";

type Update = { id: string; body: string; author_id: string | null; created_at: string };

/** Registro degli aggiornamenti di una trattativa: ogni voce ha testo, data scelta e autore; dalla più recente. */
export function Updates({ opportunityId, items, people, userId, canModerate, today }: {
  opportunityId: string; items: Update[]; people: Record<string, string>; userId: string; canModerate: boolean; today: string;
}) {
  const parent = { opportunity_id: opportunityId };
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{t.updates.title}</h2>
      <Card>
        <div className="border-b border-border p-4"><UpdateForm parent={parent} today={today} /></div>
        {items.length ? (
          <ol className="px-4 py-1">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 border-b border-border py-3 last:border-0">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(n.created_at)}{people[n.author_id ?? ""] ? ` · ${people[n.author_id ?? ""]}` : ""}</p>
                </div>
                {(n.author_id === userId || canModerate) && (
                  <form action={deleteNote.bind(null, parent, n.id)}>
                    <button aria-label={t.common.delete} className="rounded-control p-1.5 text-muted hover:bg-background hover:text-brand"><Trash2 size={14} /></button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        ) : <p className="px-4 py-6 text-center text-sm text-muted">{t.updates.empty}</p>}
      </Card>
    </section>
  );
}
