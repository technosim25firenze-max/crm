/** Converte un importo scritto dall'utente ("1.234,50", "12,5", "12.50", "€ 30") in centesimi. null se non valido. */
export function parseEuro(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = input.replace(/[€\s]/g, "");
  if (!s || /[^0-9.,]/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // l'ultimo separatore è il decimale, l'altro è il separatore delle migliaia
    const dec = Math.max(lastComma, lastDot);
    if (!/^\d{1,3}([.,]\d{3})+$/.test(s.slice(0, dec))) return null;
    s = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    // "1.234" (punto seguito da esattamente 3 cifre) o "1.234.567" sono migliaia; la virgola è sempre decimale
    const thousands = sep === "." && (parts.length > 2 || parts[1].length === 3);
    s = thousands ? parts.join("") : parts.length > 2 ? "x" : parts[0] + "." + parts[1];
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** Scorpora l'IVA da un importo lordo: restituisce netto e IVA in centesimi (netto arrotondato, IVA = lordo − netto). */
export function vatSplit(grossCents: number, ratePercent: number): { net: number; vat: number } {
  const net = Math.round(grossCents / (1 + ratePercent / 100));
  return { net, vat: grossCents - net };
}

/** Aliquota IVA predefinita (%) applicata automaticamente agli importi inseriti al netto. */
export const DEFAULT_VAT_RATE = 22;

/** IVA calcolata su un netto, in centesimi. */
export const autoVatCents = (netCents: number, ratePercent = DEFAULT_VAT_RATE) => Math.round((netCents * ratePercent) / 100);

/** Centesimi → testo per un campo ("1234,50"); stringa vuota se assente. */
export const centsToField = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** Valore lordo memorizzato + quota IVA → testi per i campi netto e IVA (IVA assente = 0, mai ricalcolata da sola). */
export function splitStored(gross: number | null | undefined, vat: number | null | undefined): { net: string; vat: string | undefined } {
  if (gross == null) return { net: "", vat: undefined };
  const v = vat ?? 0;
  return { net: centsToField(gross - v), vat: centsToField(v) };
}
