-- Nuova fase "Invia preventivo", prima di "Preventivo inviato".
do $$
declare p uuid;
begin
  select id into p from pipelines where kind = 'sales';
  insert into pipeline_stages (pipeline_id, name, position)
  select p, 'Invia preventivo', 0 where not exists (select 1 from pipeline_stages where pipeline_id = p and name = 'Invia preventivo');
  update pipeline_stages s set position = o.pos
  from (values ('Da contattare', 1), ('Chiamato', 2), ('Da richiamare', 3), ('Messaggio inviato', 4), ('Follow-up', 5),
               ('Trattativa in corso', 6), ('Visita prenotata', 7), ('Invia preventivo', 8), ('Preventivo inviato', 9), ('Prenotato', 10), ('Non interessato', 11)) as o(name, pos)
  where s.pipeline_id = p and s.name = o.name;
end $$;
