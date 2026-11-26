import { romeDayKey } from "./format";

export type Staleness = "warn" | "late" | null;

const dayNumber = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

/**
 * Quanto è ferma una scheda dall'ultimo contatto: "warn" (giallo) dopo 72 ore, "late" (rosso) dopo 7 giorni di calendario (Europe/Rome).
 */
export function staleness(lastContactAt: string | null | undefined, now: Date = new Date()): Staleness {
  if (!lastContactAt) return null;
  const last = new Date(lastContactAt);
  if (dayNumber(romeDayKey(now)) - dayNumber(romeDayKey(last)) >= 7) return "late";
  if (now.getTime() - last.getTime() >= 72 * 3600 * 1000) return "warn";
  return null;
}

/** Classi della scheda per ogni livello. */
export const STALE_CARD: Record<NonNullable<Staleness>, string> = {
  warn: "border-amber-200 bg-warning-soft",
  late: "border-red-200 bg-danger-soft",
};
