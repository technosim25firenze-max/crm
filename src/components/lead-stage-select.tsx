"use client";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui";
import { moveLead } from "@/lib/actions/leads";
import { LEAD_STAGES } from "@/lib/leads";
import { t } from "@/lib/i18n/it";

/** Fase lead nella scheda contatto; "Non è un lead" toglie il contatto dalla bacheca. */
export function LeadStageSelect({ id, stage }: { id: string; stage: string | null }) {
  const [value, setValue] = useState(stage ?? "");
  const [, start] = useTransition();
  return (
    <Select value={value} aria-label={t.leads.stage} className="h-8 w-48 text-[13px]"
      onChange={(e) => { const prev = value; setValue(e.target.value); start(async () => { const r = await moveLead(id, e.target.value || null); if (!r.ok) setValue(prev); }); }}>
      <option value="">{t.leads.notALead}</option>
      {LEAD_STAGES.map((s) => <option key={s} value={s}>{t.leads.stages[s]}</option>)}
    </Select>
  );
}
