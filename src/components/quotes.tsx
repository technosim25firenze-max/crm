import { ExternalLink, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { QuoteForm } from "@/components/forms";
import { deleteDocument } from "@/lib/actions/related";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { Doc } from "@/lib/types";

/** Preventivi di una trattativa: una riga per link, con modulo per aggiungerne altri. */
export function Quotes({ opportunityId, docs }: { opportunityId: string; docs: Doc[] }) {
  return (
    <Card>
      <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{t.quotes.title}</h2>
      {docs.length ? (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                <ExternalLink size={14} className="shrink-0 text-muted" /><span className="truncate">{d.title}</span>
                <span className="shrink-0 text-xs font-normal text-muted">{formatDate(d.created_at)}</span>
              </a>
              <form action={deleteDocument.bind(null, { opportunity_id: opportunityId }, d.id, d.storage_path)}>
                <button aria-label={t.common.delete} className="rounded-control p-1.5 text-muted hover:bg-background hover:text-brand"><Trash2 size={14} /></button>
              </form>
            </li>
          ))}
        </ul>
      ) : <p className="px-5 py-4 text-sm text-muted">{t.quotes.empty}</p>}
      <div className="border-t border-border px-5 py-4"><QuoteForm opportunityId={opportunityId} /></div>
    </Card>
  );
}
