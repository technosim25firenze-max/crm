# Setup e credenziali

## 1. Supabase
1. Crea un progetto (regione UE, es. Francoforte).
2. SQL editor: esegui in ordine tutti i file di `supabase/migrations/` (…0001 fondamenta, …0002 storage, …0003 prenotazioni/webhook, …0004 vendite/finanze/marketing) (oppure `supabase link` + `supabase db push`). **Non** eseguire `seed.sql` in produzione (dati fittizi).
3. Authentication → disabilita le registrazioni pubbliche ("Allow new users to sign up" = off) e abilita la protezione password debole/leaked. Il primo utente va creato dal dashboard (Auth → Add user) ed è automaticamente Titolare.
4. Authentication → URL Configuration: Site URL e Redirect URL = URL dell'app + `/set-password`.
5. Project Settings → API: copia URL, publishable key e service-role key.

## 2. Variabili d'ambiente (Vercel → Settings → Environment Variables)
| Variabile | Note |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pubbliche |
| `SUPABASE_SERVICE_ROLE_KEY` | **segreta**, solo server; serve solo per invitare utenti |
| `NEXT_PUBLIC_SITE_URL` | URL pubblico dell'app |

Usa progetti Supabase e ambienti Vercel distinti per sviluppo e produzione.

## 3. Vercel
Importa il repository GitHub: Next.js viene riconosciuto automaticamente, nessun `vercel.json` necessario. Imposta le variabili e distribuisci.

## 4. Backup
Piano Supabase Pro: backup giornalieri (PITR opzionale). Sul piano Free eseguire periodicamente `supabase db dump`. Il ripristino si prova su un progetto di test.

## 5. Credenziali ancora necessarie (fasi future)
- Stripe: chiave segreta con permessi limitati + segreto webhook.
- Meta: app, token di pagina con lettura lead, token di verifica webhook.
- Prenotazioni: conferma se il DB Supabase del sito (`/prenota`) può essere letto o se serve un webhook.

## 6. Ipotesi aperte
- Provider/flusso di prenotazione e pagamenti in sede (POS) da chiarire prima della Fase 4.
- Basi giuridiche GDPR, informativa e tempi di conservazione: da validare con un consulente; il gestionale registra consensi ed evidenze ma non automatizza invii promozionali.
- Regole di compenso marketing: non implementate finché non approvate.
- Mancano ancora: recupero password ("password dimenticata"), 2FA, conservazione/anonimizzazione automatica, riferimenti configurabili per auto/piste.
- Costi stimati: Vercel Hobby (0 €) o Pro (~20 €/utente); Supabase Free (0 €) o Pro (~25 €/mese).

## 7. Brand
Colori e logo ricavati da technosim25.com (`#e01f25`, `#3f843e`, `#030303`). I font Ethnocentric/Avenir del sito sono proprietari e non inclusi: l'interfaccia usa Inter. Regole di stile e token: `docs/DESIGN_SYSTEM.md`.
