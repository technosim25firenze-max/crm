"use client";
import { useRef, useState, useTransition } from "react";
import { updateOpportunityField, type OppField } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";

const NEW = "__new__";

/** Riga dettaglio modificabile sul posto: clic sul valore → campo; clic fuori (o Invio) salva, Esc annulla. */
export function InlineField({ id, field, label, display, value, type = "text", options, inputMode, placeholder }: {
  id: string; field: OppField; label: string; display: React.ReactNode; value: string;
  type?: "text" | "date" | "select" | "combo"; options?: { value: string; label: string }[]; inputMode?: "decimal" | "numeric"; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = useRef(false);
  const [creating, setCreating] = useState(false);

  function open() { setDraft(value); setError(null); done.current = false; setCreating(false); setEditing(true); }
  function save(next: string = draft) {
    if (done.current) return;
    done.current = true;
    if (next.trim() === value.trim()) { setEditing(false); return; }
    start(async () => {
      const r = await updateOpportunityField(id, field, next);
      if (r.error) { setError(r.error); done.current = false; } else setEditing(false);
    });
  }
  const cls = "h-8 w-full max-w-64 rounded-control border border-border bg-surface px-2 text-right text-sm focus:border-foreground/30 focus:outline-none focus:ring-4 focus:ring-foreground/5";
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "select") { e.preventDefault(); save(); }
    if (e.key === "Escape") { done.current = true; setEditing(false); }
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">
        {editing ? (
          <>
            {type === "combo" && !creating ? (
              <select autoFocus className={cls} value={draft} disabled={pending} onKeyDown={keys} onBlur={() => save()}
                onChange={(e) => { if (e.target.value === NEW) { setDraft(""); setCreating(true); } else { setDraft(e.target.value); save(e.target.value); } }}>
                <option value="">—</option>
                {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value={NEW}>{t.sales.newType}</option>
              </select>
            ) : type === "select" ? (
              <select autoFocus className={cls} value={draft} disabled={pending} onChange={(e) => setDraft(e.target.value)} onBlur={() => save()} onKeyDown={keys}>
                {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input autoFocus className={cls} type={type === "combo" ? "text" : type} inputMode={inputMode} placeholder={placeholder} value={draft} disabled={pending}
                onChange={(e) => setDraft(e.target.value)} onBlur={() => save()} onKeyDown={keys} />
            )}
            {error && <span role="alert" className="mt-1 block text-xs font-normal text-brand">{error}</span>}
          </>
        ) : (
          <button type="button" onClick={open} title={t.common.edit}
            className="-mr-2 rounded-control px-2 py-1 text-right transition-colors hover:bg-background">{display || <span className="text-muted">—</span>}</button>
        )}
      </dd>
    </div>
  );
}
