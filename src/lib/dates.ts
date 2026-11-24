import { romeMidnightUtc, romeToday } from "./format";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "prevmonth" | "year" | "custom";
export const RANGE_KEYS: RangeKey[] = ["today", "yesterday", "7d", "30d", "month", "prevmonth", "year", "custom"];

export interface DateRange { key: RangeKey; from: Date; to: Date; fromStr: string; toStr: string }

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (y: number, m: number, d: number, n: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const parseYmd = (s: string | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null;
};

/** Risolve un intervallo [from, to) a giorni interi Europe/Rome. `to` è esclusivo (mezzanotte successiva). */
export function resolveRange(params: { range?: string; from?: string; to?: string }, now: Date = new Date()): DateRange {
  const t = romeToday(now);
  const key = (RANGE_KEYS as string[]).includes(params.range ?? "") ? (params.range as RangeKey) : "month";
  let a = { y: t.y, m: t.m, d: 1 }, b = addDays(t.y, t.m, t.d, 1); // fine esclusiva
  if (key === "today") a = { y: t.y, m: t.m, d: t.d };
  else if (key === "yesterday") { a = addDays(t.y, t.m, t.d, -1); b = { y: t.y, m: t.m, d: t.d }; }
  else if (key === "7d") a = addDays(t.y, t.m, t.d, -6);
  else if (key === "30d") a = addDays(t.y, t.m, t.d, -29);
  else if (key === "prevmonth") {
    const py = t.m === 1 ? t.y - 1 : t.y, pm = t.m === 1 ? 12 : t.m - 1;
    a = { y: py, m: pm, d: 1 }; b = { y: t.y, m: t.m, d: 1 };
  } else if (key === "year") a = { y: t.y, m: 1, d: 1 };
  else if (key === "custom") {
    const f = parseYmd(params.from), e = parseYmd(params.to);
    if (f && e && ymd(f.y, f.m, f.d) <= ymd(e.y, e.m, e.d)) { a = f; b = addDays(e.y, e.m, e.d, 1); }
    else return resolveRange({ range: "month" }, now);
  }
  const last = addDays(b.y, b.m, b.d, -1);
  return {
    key, from: romeMidnightUtc(a.y, a.m, a.d), to: romeMidnightUtc(b.y, b.m, b.d),
    fromStr: ymd(a.y, a.m, a.d), toStr: ymd(last.y, last.m, last.d),
  };
}

/** Intervallo precedente di pari durata (per i confronti). */
export function previousRange(r: DateRange): { from: Date; to: Date } {
  const span = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - span), to: r.from };
}
