/** Normalizzazione telefono: speculare a `normalize_phone()` nel database. */
export function normalizePhone(input: string | null | undefined): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.startsWith("39") && d.length >= 11) d = d.slice(2);
  return d || null;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const e = (input ?? "").trim().toLowerCase();
  return e || null;
}
