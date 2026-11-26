import { CreditCard, MessageSquare, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { NoteForm } from "@/components/forms";
import { deleteNote } from "@/lib/actions/related";
import type { ThreadItem } from "@/lib/thread";
import { formatDateTime, formatEuro } from "@/lib/format";
import { t } from "@/lib/i18n/it";

type Parent = { contact_id: string } | { company_id: string } | { opportunity_id: string };

/** Cronologia unica: scrivi una nota (touchpoint) in alto, sotto trovi note, pagamenti e aggiornamenti in ordine di tempo. */
export function Thread({ parent, items, people, userId, canModerate, actions, composer = true }: {
  composer?: boolean; parent: Parent; items: ThreadItem[]; people: Record<string, string>; userId: string; canModerate: boolean; actions?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t.thread.title}</h2>
        {actions}
      </div>
      {composer && <div className="border-b border-border px-5 py-4"><NoteForm parent={parent} /></div>}
      {items.length ? (
        <ol className="px-5 py-2">
          {items.map((i) => (
            <li key={i.id} className="relative flex gap-3 border-b border-border py-3 last:border-0">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-muted">
                {i.kind === "note" ? <MessageSquare size={13} /> : i.kind === "payment" ? <CreditCard size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-muted/60" />}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {i.kind === "note" && (
                  <>
                    <p className="whitespace-pre-wrap">{i.body}</p>
                    <p className="mt-1 text-xs text-muted">{people[i.authorId ?? ""] ?? "—"} · {formatDateTime(i.at)}</p>
                  </>
                )}
                {i.kind === "payment" && (
                  <>
                    <p className="flex justify-between gap-3">
                      <span>{i.refund ? t.thread.refund : t.thread.payment} · {t.finance.methods[i.method as keyof typeof t.finance.methods]}</span>
                      <span className={i.refund ? "text-brand" : "font-medium"}>{i.refund ? "−" : ""}{formatEuro(i.amountCents)}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(i.at)}{i.reference ? ` · ${i.reference}` : ""}</p>
                  </>
                )}
                {i.kind === "event" && (
                  <>
                    <p className="text-muted">{i.summary}</p>
                    <p className="mt-1 text-xs text-muted">{people[i.actorId ?? ""] ? `${people[i.actorId ?? ""]} · ` : ""}{formatDateTime(i.at)}</p>
                  </>
                )}
              </div>
              {i.kind === "note" && (i.authorId === userId || canModerate) && (
                <form action={deleteNote.bind(null, parent, i.id.slice(1))}>
                  <button aria-label={t.common.delete} className="rounded-control p-1.5 text-muted hover:bg-background hover:text-brand"><Trash2 size={14} /></button>
                </form>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="px-5 py-8 text-center text-sm text-muted">{t.thread.empty}</p>}
    </Card>
  );
}
