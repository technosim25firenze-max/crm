/** Rende sicuro un termine di ricerca per i filtri `or()` di PostgREST (rimuove i caratteri di sintassi). */
export function cleanSearch(q: string | undefined): string {
  return (q ?? "").replace(/[,()%*\\"':;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
