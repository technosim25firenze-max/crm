import { t } from "@/lib/i18n/it";

export type Source = (typeof t.sourceOptions)[number];

// Valori storici ricondotti all'elenco unico (stessa mappa della migrazione 20261129000019).
const LEGACY: Record<string, Source> = {
  meta_lead_ads: "meta_ads", landing_page: "website_form", partner: "partnership", walk_in: "other", phone: "other",
};

export function normalizeSource(source: string | null | undefined): Source {
  const s = LEGACY[source ?? ""] ?? source;
  return (t.sourceOptions as readonly string[]).includes(s ?? "") ? (s as Source) : "unknown";
}

export const sourceLabel = (source: string | null | undefined) => t.sources[normalizeSource(source)];

export const SOURCE_CHOICES = t.sourceOptions.map((value) => ({ value, label: t.sources[value] }));
