import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { NoteForm, DocumentForm } from "@/components/forms";
import { deleteDocument, deleteNote } from "@/lib/actions/related";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { Activity, Doc, Note } from "@/lib/types";

type Parent = { contact_id: string } | { company_id: string } | { opportunity_id: string };
type People = Record<string, string>;

export function NotesPanel({ parent, notes, people, userId, canModerate }: { parent: Parent; notes: Note[]; people: People; userId: string; canModerate: boolean }) {
  return (
    <div className="space-y-4">
      <Card className="p-4"><NoteForm parent={parent} /></Card>
      <Card>
        {notes.length ? (
          <ul className="divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{t.notes.by} {people[n.author_id ?? ""] ?? "—"} · {formatDateTime(n.created_at)}</p>
                </div>
                {(n.author_id === userId || canModerate) && (
                  <form action={deleteNote.bind(null, parent, n.id)}>
                    <button aria-label={t.common.delete} className="rounded-control p-1.5 text-muted hover:bg-background hover:text-brand"><Trash2 size={15} /></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t.notes.empty} />}
      </Card>
    </div>
  );
}

export function DocumentsPanel({ parent, docs, signed, canModerate }: { parent: Parent; docs: Doc[]; signed: Record<string, string>; canModerate: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><DocumentForm parent={parent} /></div>
      <Card>
        {docs.length ? (
          <ul className="divide-y divide-border">
            {docs.map((d) => {
              const href = d.url ?? signed[d.id];
              return (
                <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={18} className="shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.title}</p>
                      <p className="text-xs text-muted">{[d.category, formatDateTime(d.created_at)].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-muted hover:bg-background hover:text-foreground">{t.documents.open}<ExternalLink size={14} /></a>}
                    {canModerate && (
                      <form action={deleteDocument.bind(null, parent, d.id, d.storage_path)}>
                        <button aria-label={t.common.delete} className="rounded-control p-1.5 text-muted hover:bg-background hover:text-brand"><Trash2 size={15} /></button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState title={t.documents.empty} hint={t.documents.hint} />}
      </Card>
    </div>
  );
}

export function Timeline({ items, people }: { items: Activity[]; people: People }) {
  return (
    <Card>
      {items.length ? (
        <ol className="divide-y divide-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span>{a.summary}</span>
              <span className="shrink-0 text-xs text-muted">{people[a.actor_id ?? ""] ?? ""} · {formatDateTime(a.created_at)}</span>
            </li>
          ))}
        </ol>
      ) : <EmptyState title={t.activity.empty} />}
    </Card>
  );
}
