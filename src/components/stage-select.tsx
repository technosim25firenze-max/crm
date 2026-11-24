"use client";
import { useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { moveOpportunity } from "@/lib/actions/sales";
import { t } from "@/lib/i18n/it";

/** Cambio fase dalla scheda: per "persa" chiede il motivo. */
export function StageSelect({ id, stages, current }: { id: string; stages: { id: string; name: string; kind: string }[]; current: string }) {
  const [pendingLost, setPendingLost] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(t.sales.lostReasons[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (stageId: string, r?: string) => start(async () => {
    const res = await moveOpportunity(id, stageId, r);
    setError(res.ok ? null : res.error ?? t.common.genericError);
    setPendingLost(null);
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={current} disabled={busy} aria-label={t.sales.stage} className="w-60"
        onChange={(e) => { const s = stages.find((x) => x.id === e.target.value); if (s?.kind === "lost") setPendingLost(s.id); else run(e.target.value); }}>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      {pendingLost && (
        <>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-52" aria-label={t.sales.lostReason}>{t.sales.lostReasons.map((r) => <option key={r}>{r}</option>)}</Select>
          <Button size="sm" onClick={() => run(pendingLost, reason)} disabled={busy}>{t.sales.markLost}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingLost(null)}>{t.common.cancel}</Button>
        </>
      )}
      {error && <span role="alert" className="text-xs text-brand">{error}</span>}
    </div>
  );
}
