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
