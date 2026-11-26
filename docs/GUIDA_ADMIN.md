# Guida rapida per gli amministratori

**Accesso.** Vai all'indirizzo del gestionale e accedi con email e password. Un nuovo collaboratore riceve un invito via email e sceglie la propria password.

**Contatti.** `Contatti → Persone`: cerca per nome, email o telefono; filtra per tipo. `Nuovo contatto` richiede solo nome (o cognome); i campi aggiuntivi sono in "Altri dettagli". Se esiste già qualcuno con la stessa email o telefono, compare un avviso: puoi aprire il contatto esistente o creare comunque.

**Scheda contatto.** Un'unica pagina: dettagli (azienda, città, stato, origine), trattative, prenotazioni e una **cronologia** che unisce note (touchpoint), pagamenti e aggiornamenti; a destra tag, aziende, documenti (file fino a 10 MB o link Drive) e consensi. Origini disponibili: Modulo sito, Ricerca, Meta Ads, Referenza attribuibile a Meta, Referenza normale, Passaparola, Partnership. In `Contatti` puoi passare da **Elenco** a **Bacheca** (una colonna per stato, trascina per cambiarlo).

**Schede ferme.** Una carta (trattativa o persona) diventa gialla dopo 72 ore dall'ultimo contatto e rossa dopo 7 giorni di calendario. L'ultimo contatto è l'ultima nota scritta: aggiungi una nota (anche solo "Chiamato, non risponde") per azzerare il conteggio.

**Duplicati.** Nella scheda compare "Possibile duplicato" con `Unisci in questo profilo`: note, documenti, tag e aziende vengono spostati e il duplicato archiviato. Solo Titolare e Amministratore.

**Aziende.** `Contatti → Aziende`: un contatto può appartenere a più aziende, con un ruolo per ciascuna.

**Consensi.** Registra canale, esito e come è stato ottenuto. Una richiesta di informazioni non è consenso promozionale. "Non contattare" esclude il contatto da ogni comunicazione promozionale.

**Import/Esporta.** `Impostazioni → Dati`: carica un CSV, collega le colonne, controlla l'anteprima (duplicati ed errori vengono saltati) e conferma. I contatti importati hanno origine "Importazione" e attribuzione "Sconosciuta". L'esportazione scarica un CSV (separatore `;`).

**Ruoli.** Titolare: tutto, compresi utenti. Amministratore: CRM, import/export. Marketing: contatti e consensi. Staff: contatti, note e documenti. Solo il Titolare gestisce utenti (`Impostazioni → Utenti`).

## Vendite
`Vendite` ha due schede: Pipeline e Da fare (ricontatti e promemoria). Ci sono due bacheche identiche, **Eventi** e **Individui** (scegli in alto; ogni scheda ha il campo «Tipo», default Eventi: cambiandolo la carta passa all'altra bacheca, nella stessa fase). I lead Meta e quelli inseriti a mano partono come Eventi, le prenotazioni del sito come Individui. Le fasi: Da contattare → Chiamato → Da richiamare → Messaggio inviato → Follow-up → Trattativa in corso → Visita prenotata → Preventivo inviato → Prenotato / Non interessato. I lead Meta entrano in «Da contattare»; le prenotazioni del sito entrano direttamente in «Prenotato». Ogni riga o carta ha un menu «⋯» con modifica, eliminazione e altre azioni. Trascina la carta nella fase successiva (su tablet usa il menu sulla carta). Per "Prenotato" si conferma il valore totale e il primo incasso con data; per "Non interessato" viene chiesto il motivo. Aprendo la carta trovi in una sola pagina: dettagli (un solo **Valore**, durata in ore), preventivi (una riga per link) e la cronologia con note, pagamenti e cambi di fase. **"Prenotato" non significa pagato**: gli incassi si registrano in Finanze o dalla scheda della trattativa.

## Attività e ricontatti
Dalla scheda di un contatto o di una trattativa usa "Ricontatto" per creare un'attività con scadenza. Quelle in ritardo compaiono in rosso e nella Panoramica.

## Finanze (Titolare e Amministratore)
- **Registra pagamento**: importo, metodo, cliente. Se esiste già un pagamento uguale per lo stesso cliente nelle 24 ore precedenti compare un avviso: non registrare a mano ciò che arriva da Stripe.
- **Acconti e saldi**: registra ogni versamento separatamente; il residuo di una trattativa acquisita o di una prenotazione è valore concordato meno incassato.
- **Rimborsi**: "Rimborsa" crea un movimento negativo e non può superare l'importo incassato. I pagamenti non si cancellano.
- **IVA**: ogni pagamento ha la sua aliquota (22% di default); i totali "IVA esclusa" la scorporano. Il margine mostrato è una stima operativa, non l'utile contabile; il gestionale non sostituisce fatture, scontrini e registratore di cassa.
- **Spese**: fisse o variabili; categorie modificabili in Impostazioni.

## Statistiche
Scegli il periodo (oggi, ultimi 7/30 giorni, mese, anno o date personalizzate). Marketing: inserisci la spesa pubblicitaria a mano; costo per contatto e ritorno sulla spesa sono **stime** e compaiono solo se esiste la spesa del periodo.

## Impostazioni
Pipeline (rinomina, ordina, aggiungi o elimina fasi vuote), Servizi (catalogo prezzi: i pagamenti passati non cambiano), Categorie (tag e categorie di spesa).

## Prenotazioni
- **Nuova prenotazione**: dal pulsante in Prenotazioni o dalla scheda di un contatto. Scegli il contatto (o "Crea nuovo contatto" al volo), data e ora, durata, servizio, simulatore e totale. Titolare e Amministratore possono indicare subito un acconto. Se il simulatore è già occupato compare un avviso.
- **Prenotazioni dal sito**: arrivano da sole. Nella scheda "Non collegato" trovi quelle senza contatto: "Collega a un contatto" cerca (già precompilato con nome ed email) o crea il contatto. I dati del sito non si modificano da qui; note interne e collegamento sì.
- **Collegare tutto a un contatto**: prenotazioni, pagamenti e trattative si collegano da dove sono (pulsante "Collega a un contatto") oppure dalla scheda del contatto ("Collega esistente"). Se inserisci un nuovo contatto con email o telefono già presenti viene usato quello esistente.
