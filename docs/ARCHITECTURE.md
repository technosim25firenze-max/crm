# TechnoSim25 CRM — Architettura

Stato: Fase 1 (fondamenta) e Fase 2 (CRM base) implementate. Le altre fasi sono progettate qui, non costruite.

## 1. Principi

- Un solo repository, un progetto Supabase, un'app Vercel. Nessun servizio aggiuntivo.
- Next.js 16 (App Router) + Server Components + Server Actions. Il browser non vede mai la service-role key.
- Ogni query utente passa dal client Supabase **con la sessione dell'utente**, quindi le policy RLS di PostgreSQL sono l'autorità. La UI nasconde solo ciò che non serve.
- Importi in **centesimi (integer)**. Timestamp in UTC (`timestamptz`), mostrati in Europe/Rome.
- Design: principi in `docs/DESIGN.md`, regole e token in `docs/DESIGN_SYSTEM.md` (token in `src/app/globals.css`, primitive in `src/components/ui`).
- UI interamente in italiano, stringhe in `src/lib/i18n/it.ts`; formati in `src/lib/format.ts` (`Intl`, `it-IT`).
- Si costruisce solo ciò che serve oggi; lo schema è però già pronto per le fasi successive.

## 2. Scoperte sull'ambiente (18/11/2026)

| Elemento | Esito |
|---|---|
| Sito technosim25.com | App Next.js custom, immagini su Supabase Storage. Prenotazione interna (`/prenota`, `/eventi`, `/gift-card`): **nessun provider terzo identificato**. |
| Brand | `--color-primary #e01f25`, `--color-secondary #3f843e`, nero `#030303`, grigio `#d7d8dd`; font Ethnocentric (titoli) e Avenir. Logo `/logos/logo-white-colored.png` (bianco, tricolore, "25" rosso). |
| Credenziali | Nessuna presente (Supabase, Stripe, Meta). Docker assente. |

Conseguenza: lo schema e le policy RLS sono verificati con PGlite (Postgres in-process, `npm test`). Il collegamento a un progetto Supabase reale richiede le credenziali (vedi `docs/SETUP.md`).

## 3. Mappa del dominio (Fase 1–2 implementata, resto pianificato)

```
auth.users 1─1 profiles(role)
contacts ─< company_contacts >─ companies        (ruolo per associazione)
contacts >─< tags (contact_tags)   companies >─< tags (company_tags)
contacts/companies ─< notes, documents, activities
contacts ─< marketing_consents (per canale, con evidenza)
import_jobs (storico import CSV)       audit_logs (trigger su tabelle sensibili)

[Fase 3] pipelines ─< pipeline_stages ─< opportunities ─< opportunity_stage_history ; tasks
[Fase 4] services, resources, bookings ─< booking_services ; payments ─< payment_allocations >─ bookings ; refunds ; webhook_events
[Fase 5] expenses, expense_categories
[Fase 6] campaigns, lead_submissions, marketing_spend, attribution_records
```

Una prenotazione ≠ un incasso: i pagamenti sono righe separate allocate alle prenotazioni (acconti, saldi, rimborsi). Stato prenotazione, stato pagamento e stato opportunità sono concetti distinti.

## 4. Matrice permessi (applicata da RLS)

| Risorsa | Owner | Admin | Marketing | Staff |
|---|---|---|---|---|
| Contatti/aziende: lettura | ✔ | ✔ | ✔ | ✔ |
| Contatti/aziende: creazione e modifica | ✔ | ✔ | ✔ (solo creazione/modifica) | ✔ |
| Archiviazione / unione contatti | ✔ | ✔ | ✖ | ✖ |
| Note, documenti, attività | ✔ | ✔ | ✔ | ✔ |
| Consensi marketing | ✔ | ✔ | ✔ | lettura |
| Esportazione CSV, import CSV | ✔ | ✔ | ✖ | ✖ |
| Utenti e ruoli | ✔ | ✖ | ✖ | ✖ |
| Impostazioni azienda | ✔ | lettura | lettura | lettura |
| Audit log | ✔ | ✔ | ✖ | ✖ |
| Finanza (Fase 4+) | ✔ | ✔ | solo aggregati marketing | ✖ (registrazione pagamenti se abilitata) |

Default minimo privilegio: un nuovo utente è `staff`; il primo utente creato diventa `owner`.

## 5. Rotte

Navigazione (7 voci): Panoramica `/dashboard` · Contatti `/contacts` (schede Persone / Aziende) · Vendite `/sales` · Prenotazioni `/bookings` · Finanze `/finance` · Statistiche `/analytics` · Impostazioni `/settings` (schede Utenti, Integrazioni, Dati).

Dettaglio: `/contacts/[id]`, `/companies/[id]`, `/login`. Le sezioni delle fasi future mostrano uno stato "non ancora attivo" onesto.

Contratti (Fase 1–2): server actions tipizzate con Zod (`src/lib/actions/*`) che restituiscono `{ ok: true, data } | { ok: false, error }`; unico route handler `GET /api/contacts/export` (CSV, owner/admin). Webhook (`/api/webhooks/stripe`, `/api/webhooks/meta`) nelle fasi 4 e 6, con firma sul body grezzo e idempotenza su `webhook_events.provider_event_id`.

## 6. Matrice delle integrazioni

| Integrazione | Fase | Necessario | Stato |
|---|---|---|---|
| Supabase (DB, Auth, Storage) | 1 | URL, publishable key, service-role key | In attesa credenziali |
| Prenotazioni | 4 | Capire se il DB Supabase del sito è condivisibile (lettura) o servono webhook; adapter + mock | **Da confermare con il titolare** |
| Stripe | 4 | Secret key (ristretta), webhook secret | Non iniziato |
| Meta Lead Ads | 6 | App Meta, token pagina, `leads_retrieval`, verify token | Non iniziato |
| Meta Ads Insights, Google Ads/GA | 6+ | Accessi separati dai lead | Import CSV come primo passo |

## 7. Piano ordinato

1. ✔ Fondamenta: auth, ruoli, layout, tema, RLS, audit.
2. ✔ CRM: contatti, aziende, tag, note, documenti, consensi, duplicati, unione, import/export CSV.
3. Vendite: un'unica pipeline configurabile (schede Individuale/Evento), kanban, task.
4. Prenotazioni + pagamenti (Stripe, manuali, rimborsi, saldi).
5. Finanze: spese, KPI, dashboard.
6. Marketing: Meta Lead Ads, attribuzione, spesa.
7. Avanzate solo se richieste.

## 8. Rischi e ipotesi aperte

- Provider prenotazioni sconosciuto (probabile sistema custom del sito): sbloccare con accesso al repository/DB del sito.
- Pagamenti in sede (POS/Terminal) potrebbero duplicare incassi Stripe: serve mappatura per ID esterno prima della Fase 4.
- Regole di compenso marketing e GDPR (basi giuridiche, retention) richiedono validazione legale; nulla è cablato.
- L'app non sostituisce fatturazione/scontrini fiscali.
- Costi stimati: Vercel Hobby/Pro e Supabase Free/Pro (≈ 0–45 €/mese); nessun'altra infrastruttura.
