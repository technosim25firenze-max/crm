import { z } from "zod";
import { parseEuro } from "@/lib/money";
import { t } from "@/lib/i18n/it";

/** Importo scritto dall'utente → centesimi (undefined se vuoto). */
export const euroField = z.string().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  const c = parseEuro(v);
  if (c === null) { ctx.addIssue({ code: "custom", message: t.validation.amount }); return z.NEVER; }
  return c;
});

export const positiveEuro = euroField.refine((v) => v === undefined || v > 0, { message: t.validation.positive });

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t.validation.date).optional();

export const intField = (min: number, max: number) => z.string().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) { ctx.addIssue({ code: "custom", message: t.validation.number }); return z.NEVER; }
  return n;
});

export const uuid = z.string().uuid().optional();

/** Importo lordo da netto + IVA (IVA assente o vuota = nessuna IVA). Undefined se manca il netto. */
export const grossCents = (net: number | undefined, vat: number | undefined) => (net === undefined ? undefined : net + (vat ?? 0));
/** Aliquota (%) con quattro decimali ricavata da netto e IVA, per la colonna vat_rate dei pagamenti. */
export const vatRateOf = (net: number, vat: number | undefined) => (net > 0 && vat ? Math.min(100, Math.round((vat / net) * 1_000_000) / 10_000) : 0);
