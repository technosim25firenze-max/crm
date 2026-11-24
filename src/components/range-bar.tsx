import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { RANGE_KEYS, type DateRange } from "@/lib/dates";
import { t } from "@/lib/i18n/it";
import { cn } from "@/lib/utils";

/** Selettore periodo (preset + date personalizzate). Mantiene gli altri parametri dell'URL (es. scheda). */
export function RangeBar({ base, range, keep = {} }: { base: string; range: DateRange; keep?: Record<string, string> }) {
  const href = (key: string) => `${base}?${new URLSearchParams({ ...keep, range: key })}`;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {RANGE_KEYS.filter((k) => k !== "custom").map((k) => (
        <Link key={k} href={href(k)} className={cn("rounded-full border px-3 py-1 text-[13px]", range.key === k ? "border-foreground bg-foreground text-white" : "border-border bg-surface text-muted hover:text-foreground")}>
          {t.ranges[k]}
        </Link>
      ))}
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
