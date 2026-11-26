-- (bookings ha già vat_cents.)
-- Gli importi si inseriscono al netto (la nostra parte) e l'IVA si aggiunge a parte (22% di default, azzerabile).
-- I valori restano memorizzati lordi (netto + IVA); qui si conserva la quota IVA per ricostruire netto e IVA nei form.
alter table opportunities add column vat_cents int check (vat_cents is null or vat_cents >= 0);

-- Aliquota registrata sui pagamenti con più decimali: l'IVA inserita a mano (importo, non percentuale) si scorpora senza scarti di centesimi.
alter table payments alter column vat_rate type numeric(7, 4);
