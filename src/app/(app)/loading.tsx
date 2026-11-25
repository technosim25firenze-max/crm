/** Mostrato subito durante i cambi pagina, mentre il server prepara i dati. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Caricamento">
      <div className="h-7 w-48 rounded-control bg-border" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-card bg-border/70" />)}
      </div>
      <div className="h-64 rounded-card bg-border/70" />
    </div>
  );
}
