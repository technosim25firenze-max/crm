# TechnoSim25 CRM

Gestionale interno (CRM + base per finanze e statistiche) per TechnoSim25. Interfaccia in italiano, valuta EUR, fuso Europe/Rome.

**Stack:** Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · Supabase (Postgres, Auth, Storage) · Zod · Vitest · Playwright.

## Stato

| Area | Stato |
|---|---|
| Fondamenta (auth, ruoli, RLS, audit, layout, tema) | ✔ |
| CRM (contatti, aziende, tag, note, documenti, consensi, duplicati, unione, import/export CSV) | ✔ |
| Vendite: pipeline B2B/B2C configurabili, bacheca drag-and-drop, elenco, attività e ricontatti, preventivi come link/file, cronologia fasi | ✔ |
| Finanze: pagamenti manuali (contanti, carta in sede, bonifico, gift card), acconti/saldi, rimborsi, residui, spese, margine stimato, riconciliazione | ✔ |
| Statistiche: ricavi, clienti, prenotazioni, marketing (spesa inserita a mano, CPL, ritorno stimato) | ✔ |
| Prenotazioni via webhook JSON (ricezione, elenco, controllo) | ✔ pronto, in attesa del JSON reale del sito (`docs/BOOKING_WEBHOOK.md`) |
| Stripe (pagamenti e rimborsi online) | ✖ in attesa delle credenziali; i movimenti Stripe andranno nella stessa tabella `payments` |
| Meta Lead Ads (ricezione automatica) | ✖ in attesa di app e token Meta; nel frattempo origine e spesa si inseriscono a mano |
| Calendario prenotazioni, eventi aziendali, compensi marketing, segmentazioni avanzate | ✖ rinviati (non richiesti per l'avvio) |

Tutti i numeri provengono dal database: dove non ci sono dati compaiono stati vuoti o "—", mai valori inventati.

## Avvio locale

```bash
npm install
cp .env.example .env.local     # compila con le chiavi del tuo progetto Supabase
# applica in ordine supabase/migrations/*.sql (4 file) (dashboard SQL editor o `supabase db push`) e, solo in sviluppo, supabase/seed.sql
npm run dev
```

Il primo utente creato in Supabase Auth diventa **Titolare**; gli invitati sono **Staff** finché il titolare non cambia il ruolo. Dettagli in `docs/SETUP.md`.

## Verifiche

```bash
npm run typecheck && npm run lint
npm test            # schema + RLS su Postgres in-process (PGlite) e logica applicativa
npm run test:e2e    # Playwright: routing, protezione rotte, localizzazione (senza backend)
npm run build
```

## Documentazione

- `docs/ARCHITECTURE.md` — architettura, dominio, permessi, integrazioni, rischi
- `docs/SETUP.md` — Supabase, Vercel, credenziali, ipotesi aperte
- `docs/DESIGN.md` — brief di design (UI premium, stile Framer); `docs/DESIGN_SYSTEM.md` — regole applicate e dove vivono nel codice
- `docs/BOOKING_WEBHOOK.md` — contratto e collegamento del webhook prenotazioni
- `docs/GUIDA_ADMIN.md` — guida all'uso per gli amministratori
