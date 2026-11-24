# Design system

Come applichiamo in questa app i principi di [`DESIGN.md`](./DESIGN.md) (obiettivo: UI premium e pulita, stile Framer). `DESIGN.md` è il brief di riferimento; questo file descrive le regole concrete e dove vivono nel codice.

## Fonti di verità
- **Token** (colori, raggi, ombre, easing): `src/app/globals.css`. Non scrivere colori esadecimali o raggi nei componenti: usa `bg-brand`, `rounded-control`, `rounded-card`, `rounded-modal`, `shadow-card`, `shadow-pop`.
- **Primitive** (Button, Input, Card, Badge, Tabs, PageHeader, EmptyState): `src/components/ui/index.tsx`; modale in `src/components/ui/dialog.tsx`. Prima di creare un nuovo elemento, riusa o estendi questi.
- **Shell** dell'app: `src/components/sidebar.tsx`, `src/components/topbar.tsx`, `src/app/(app)/layout.tsx`.

## Regole
1. **Tipografia**: Inter (`next/font`), titoli con tracking negativo e `text-wrap: balance`, numeri con `tabular-nums`. Gerarchia netta: titolo pagina 24px, sezioni 14–16px, testo 14px, etichette 13px.
2. **Spazio**: aria generosa (padding pagina 32–40px, card con `p-5`), allineamenti coerenti, righe di testo brevi (`max-w-prose`).
3. **Colore**: neutri + un solo accento. Rosso `#e01f25` solo per azione principale, stato attivo ed errori; verde per esiti positivi. Niente altri colori decorativi.
4. **Dettagli**: bordi sottili `border-border`, raggi coerenti (controlli 10px, card 16px, modali 20px), ombre soffici.
5. **Movimento**: sobrio e uniforme. Ingresso pagina `rise-in`, transizioni 150–220ms, pressione dei pulsanti `active:scale-[0.98]`, modali con fade/pop. Nessuna libreria di animazione: solo CSS. `prefers-reduced-motion` disattiva tutto. Test: senza animazioni la pagina deve restare ottima.
6. **Icone**: solo Lucide (`lucide-react`).
7. **Mobile** curato quanto desktop; layout stabili (niente salti al caricamento).
8. **Testi**: brevi e specifici, sempre in italiano da `src/lib/i18n/it.ts`.

## Librerie
In uso: Tailwind 4, Radix Dialog, Lucide. Valutate dal brief ma non adottate (aggiungere solo se serve un caso concreto): Motion (transizioni di layout), GSAP, Lenis (smooth scroll, evitare di default), shadcn/ui, React Bits.

## Quando aggiungi UI
Parti dalle primitive, usa i token, verifica focus visibile e stato vuoto, controlla mobile, poi aggiungi movimento solo se chiarisce una relazione.
