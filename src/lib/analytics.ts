import { romeWeekdayHour } from "./format";

/** Origini considerate "da pubblicità a pagamento" per la stima del ritorno sulla spesa. */
export const AD_SOURCES = ["meta_lead_ads", "meta_ads", "google_ads"] as const;

export interface BookingRow { starts_at: string | null; status: string; resource_name: string | null; service_name: string | null; contact_id?: string | null }

export function bookingStats(rows: BookingRow[]) {
  const byWeekday = Array<number>(7).fill(0), byHour = Array<number>(24).fill(0);
  const byResource: Record<string, number> = {}, byService: Record<string, number> = {};
  let completed = 0, cancelled = 0, noShow = 0;
  for (const b of rows) {
    if (b.status === "completed") completed++;
    if (b.status === "cancelled") cancelled++;
    if (b.status === "no_show") noShow++;
    if (b.status === "cancelled") continue; // le annullate non occupano un simulatore
    if (b.starts_at) {
      const { weekday, hour } = romeWeekdayHour(b.starts_at);
      byWeekday[weekday]++; byHour[hour]++;
    }
    if (b.resource_name) byResource[b.resource_name] = (byResource[b.resource_name] ?? 0) + 1;
    if (b.service_name) byService[b.service_name] = (byService[b.service_name] ?? 0) + 1;
  }
  const noShowRate = rows.length ? noShow / rows.length : 0;
  return { total: rows.length, completed, cancelled, noShow, noShowRate, byWeekday, byHour, byResource, byService };
}

/** Clienti ricorrenti: almeno due prenotazioni valide o due incassi (giorni distinti non richiesti: conta i movimenti). */
export function returningCustomers(bookings: { contact_id: string | null; status: string }[], payments: { contact_id: string | null; kind: string }[] | null) {
  const counts = new Map<string, { b: number; p: number }>();
  const bump = (id: string | null, f: "b" | "p") => { if (!id) return; const c = counts.get(id) ?? { b: 0, p: 0 }; c[f]++; counts.set(id, c); };
  bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show").forEach((b) => bump(b.contact_id, "b"));
  payments?.filter((p) => p.kind === "payment").forEach((p) => bump(p.contact_id, "p"));
  const customers = counts.size;
  const returning = [...counts.values()].filter((c) => c.b >= 2 || c.p >= 2).length;
  return { customers, returning, rate: customers ? returning / customers : 0 };
}

export interface MarketingInput { spendCents: number; leads: number; attributedNetCents: number; opportunities: number; won: number; impressions?: number; clicks?: number }

/** KPI marketing. Se manca la spesa, CPL e ROAS sono null: non si inventano valori. */
export function marketingKpis(i: MarketingInput) {
  return {
    cplCents: i.spendCents > 0 && i.leads > 0 ? Math.round(i.spendCents / i.leads) : null,
    roas: i.spendCents > 0 ? Math.round((i.attributedNetCents / i.spendCents) * 100) / 100 : null,
    conversion: i.leads > 0 ? i.won / i.leads : null,
    ctr: i.impressions && i.clicks != null ? i.clicks / i.impressions : null,
    cpcCents: i.clicks && i.spendCents > 0 ? Math.round(i.spendCents / i.clicks) : null,
  };
}
