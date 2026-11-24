const LOCALE = "it-IT";
const TZ = "Europe/Rome";

const eur = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat(LOCALE);
const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

/** Importi in centesimi → "1.234,50 €". */
export const formatEuro = (cents: number) => eur.format(cents / 100);
export const formatNumber = (n: number) => num.format(n);
export const formatDate = (iso: string | Date | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const formatDateTime = (iso: string | Date | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");

/** Inizio del mese corrente (00:00 Europe/Rome) come istante UTC. */
export function startOfMonthRome(now: Date = new Date()): Date {
  const { y, m } = romeToday(now);
  return romeMidnightUtc(y, m, 1);
}

/** Mezzanotte Europe/Rome di una data civile (anno, mese 1-12, giorno) come istante UTC. */
export function romeMidnightUtc(year: number, month: number, day: number): Date {
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const romeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(utcMidnight));
  return new Date(utcMidnight.getTime() - romeHour * 3600_000);
}

/** Data civile corrente a Roma (YYYY, M, D). */
export function romeToday(now: Date = new Date()): { y: number; m: number; d: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/** Giorno della settimana (0=lunedì … 6=domenica) e ora, a Roma. */
export function romeWeekdayHour(iso: string | Date): { weekday: number; hour: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return { weekday: idx, hour: Number(parts.hour) % 24 };
}

/** Chiave "YYYY-MM" del mese a Roma. */
export function romeMonthKey(iso: string | Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

/** Interpreta "YYYY-MM-DDTHH:mm" (campo datetime-local) come ora di Roma → istante UTC. */
export function romeLocalToUtc(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return new Date(romeMidnightUtc(y, mo, d).getTime() + (h * 60 + mi) * 60_000);
}

/** Valore per un campo datetime-local in ora di Roma. */
export function toRomeLocalInput(d: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** Chiave "YYYY-MM-DD" del giorno a Roma. */
export function romeDayKey(iso: string | Date): string {
  const p = romeToday(new Date(iso));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
