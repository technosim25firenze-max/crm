import { RangeSelect } from "@/components/range-select";
import { Button, Input } from "@/components/ui";
import type { DateRange } from "@/lib/dates";
import { t } from "@/lib/i18n/it";

/** Selettore periodo (preset + date personalizzate). Mantiene gli altri parametri dell'URL (es. scheda). */
export function RangeBar({ base, range, keep = {} }: { base: string; range: DateRange; keep?: Record<string, string> }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <RangeSelect base={base} current={range.key} keep={keep} />
      <form action={base} className="flex items-center gap-1.5">
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="range" value="custom" />
        <Input name="from" type="date" defaultValue={range.fromStr} className="h-8 w-36" aria-label={t.ranges.from} />
        <Input name="to" type="date" defaultValue={range.toStr} className="h-8 w-36" aria-label={t.ranges.to} />
        <Button type="submit" size="sm" variant={range.key === "custom" ? "primary" : "secondary"}>{t.ranges.apply}</Button>
      </form>
    </div>
  );
}
