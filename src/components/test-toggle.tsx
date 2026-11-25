"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n/it";

/** Menu a tre puntini accanto alle schede: "Nascondi prenotazioni di prova" (attivo di default). */
export function TestToggle({ showTests }: { showTests: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  // Stato locale: la spunta risponde subito, senza attendere il ricaricamento della pagina.
  const [hidden, setHidden] = useOptimistic(!showTests);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  function change(hide: boolean) {
    const next = new URLSearchParams(params.toString());
    if (hide) next.delete("test"); else next.set("test", "1");
    const qs = next.toString();
    startTransition(() => { setHidden(hide); router.push(qs ? `${pathname}?${qs}` : pathname); });
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={t.bookingsPage.moreOptions} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-border bg-surface p-2 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-background">
            <input type="checkbox" checked={hidden} onChange={(e) => change(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
            {t.bookingsPage.hideTests}
          </label>
        </div>
      )}
    </div>
  );
}
