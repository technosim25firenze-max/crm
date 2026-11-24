/** Neutralizza l'iniezione di formule nei fogli di calcolo (=, +, -, @). */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Delimitatore ";" perché Excel in locale italiano lo usa come separatore di lista. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}
