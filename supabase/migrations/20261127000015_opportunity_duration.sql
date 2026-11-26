-- Durata dell'evento (minuti), modificabile dalla scheda della trattativa.
alter table opportunities add column duration_minutes int check (duration_minutes is null or duration_minutes between 1 and 10080);
