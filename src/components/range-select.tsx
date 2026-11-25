"use client";
import { useRouter } from "next/navigation";
import { useNav } from "@/components/nav-provider";
import { Select } from "@/components/ui";
import { RANGE_KEYS } from "@/lib/dates";
import { t } from "@/lib/i18n/it";

/** Menu a tendina dei periodi predefiniti: al cambio ricarica la pagina con il nuovo periodo. */
export function RangeSelect({ base, current, keep }: { base: string; current: string; keep: Record<string, string> }) {
  const router = useRouter();
  const nav = useNav();
  return (
    <Select aria-label={t.ranges.label} value={nav?.target ? new URL(nav.target, "http://x").searchParams.get("range") ?? current : current} className="w-48"
      onChange={(e) => { const href = `${base}?${new URLSearchParams({ ...keep, range: e.target.value })}`; if (nav) nav.go(href); else router.push(href); }}>
      {current === "custom" && <option value="custom" disabled>{t.ranges.custom}</option>}
      {RANGE_KEYS.filter((k) => k !== "custom").map((k) => <option key={k} value={k}>{t.ranges[k]}</option>)}
    </Select>
  );
}
