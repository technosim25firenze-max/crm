# Webhook prenotazioni

**Indirizzo da incollare nella piattaforma:** `https://<dominio-pubblicato>/api/webhooks/bookings?token=<BOOKINGS_WEBHOOK_SECRET>`

L'indirizzo completo (con il codice segreto) è visibile al Titolare in *Impostazioni → Integrazioni → "Mostra l'indirizzo completo"*. Il dominio è quello di Vercel dopo la pubblicazione: imposta `NEXT_PUBLIC_SUPABASE_URL`… e soprattutto `NEXT_PUBLIC_SITE_URL` e `BOOKINGS_WEBHOOK_SECRET` su Vercel prima di usarlo.

## Autenticazione (basta una)
1. `?token=<segreto>` nell'URL (consigliato se la piattaforma accetta solo un indirizzo);
2. header `Authorization: Bearer <segreto>`, `x-webhook-secret` o `x-webhook-token`;
3. firma HMAC-SHA256 esadecimale del body grezzo in `x-signature`, `x-webhook-signature` o `x-hub-signature-256`.
Senza autenticazione valida: `401`. Il token nell'URL può comparire nei log del mittente: se possibile preferisci l'header.

## Formato ricevuto
Array di eventi `{ id, type, version, created_at, data: { payment, bookings[], customer, attribution, checkout_id } }` (importi in **euro**, date ISO con offset). Un evento può contenere più prenotazioni dello stesso checkout.

| Dato | Dove finisce |
|---|---|
| `bookings[].id` | `external_id` (chiave di idempotenza della prenotazione) |
| `start_at`, `end_at`, `status` | orario (UTC), stato: CONFIRMED→Confermata, PENDING→In attesa, COMPLETED→Completata, CANCELLED/CANCELED→Annullata, NO_SHOW→Non presentato. **Stato sconosciuto → evento "non riconosciuto"** (mai indovinato) |
| `booking_label`, `booking_number`, `simulators[].code` | servizio, numero, simulatore |
| `cost_amount` | totale prenotazione (centesimi) |
| `payment.paid_amount` | incassato online; ripartito tra le prenotazioni del checkout in proporzione al costo; replicato in Finanze come pagamento "booking_platform" (solo la quota nuova; si disattiva in Integrazioni) |
| `payment.option/balance_due` | dettagli (acconto, saldo online residuo) |
| `customer` | contatto: collegato per email, poi telefono se univoco (mai per nome); se non esiste viene creato |
| `customer.marketing_consent` | consenso marketing registrato con prova; **canale presunto: email** (serve un indirizzo) — da validare con il consulente privacy |
| `attribution` (UTM) | sul contatto se nuovo (prima provenienza), sempre sulla prenotazione. Regola: medium a pagamento (cpc, paid, paid_social…) + instagram/facebook → *Meta Ads* (attribuzione "marketing"), + google → *Google Ads*; instagram/facebook/google senza medium a pagamento → origine organica; nessun UTM → accesso diretto |

## Risposte
`200` elaborato / duplicato / evento di prova · `202` salvato ma non riconosciuto (visibile in Prenotazioni, si rielabora con "Rielabora") · `400` JSON non valido · `401` non autenticato · `413` troppo grande · `500` errore, il mittente può ritentare (l'elaborazione è idempotente).

## Comportamenti
- **Eventi di prova** (`type` contenente `test`) sono confermati ma non creano prenotazioni; compaiono come "di prova".
- **Eventi fuori ordine**: vince quello con `created_at` più recente.
- **Prenotazioni del sito sono in sola lettura** nel gestionale: si possono collegare a un contatto (o creare il contatto dai loro dati) e aggiungere note interne.
- Il residuo di una prenotazione = totale − pagato online − pagamenti registrati in sede (i pagamenti replicati dalla piattaforma non si contano due volte).

## Prova
```bash
curl -X POST "https://<dominio>/api/webhooks/bookings?token=<segreto>" -H "content-type: application/json" -d '[{"id":"prova:1","type":"webhook.test","data":{}}]'
```
Risposta attesa: `200` con `"status":"test_received"`.
