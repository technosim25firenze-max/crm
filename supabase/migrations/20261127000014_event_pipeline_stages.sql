-- Pipeline unica per gli eventi (niente più "Individuale"). Fasi:
-- Da contattare → Chiamato → Da richiamare → Messaggio inviato → Follow-up → Trattativa in corso → Visita prenotata → Preventivo inviato → Prenotato / Non interessato.
do $$
declare p uuid;
begin
  select id into p from pipelines where kind = 'sales';
  update pipeline_stages set name = 'Prenotato' where pipeline_id = p and kind = 'won';
  update pipeline_stages set name = 'Non interessato' where pipeline_id = p and kind = 'lost';
  insert into pipeline_stages (pipeline_id, name, position)
  select p, n, 0 from unnest(array['Da richiamare', 'Trattativa in corso']) n
  where not exists (select 1 from pipeline_stages s where s.pipeline_id = p and s.name = n);
  update pipeline_stages s set position = o.pos
  from (values ('Da contattare', 1), ('Chiamato', 2), ('Da richiamare', 3), ('Messaggio inviato', 4), ('Follow-up', 5),
               ('Trattativa in corso', 6), ('Visita prenotata', 7), ('Preventivo inviato', 8), ('Prenotato', 9), ('Non interessato', 10)) as o(name, pos)
  where s.pipeline_id = p and s.name = o.name;
end $$;

-- Solo eventi: tutte le schede diventano "event" (la colonna resta, ma non ha più un ruolo nell'interfaccia).
update opportunities set kind = 'event' where kind <> 'event';

create or replace function booking_sync_opportunity() returns trigger language plpgsql security definer set search_path = public as $$
declare p uuid; st uuid; v_lost boolean;
begin
  if new.is_test then
    delete from opportunities where booking_id = new.id;
    return null;
  end if;
  select id into p from pipelines where kind = 'sales';
  if p is null then return null; end if;
  v_lost := new.status = 'cancelled';
  select id into st from pipeline_stages where pipeline_id = p and kind = case when v_lost then 'lost' else 'won' end order by position limit 1;
  insert into opportunities (pipeline_id, stage_id, name, contact_id, source, kind, event_date, attendees, agreed_value_cents, booking_id, lost_reason)
  values (p, st, coalesce(nullif(btrim(new.customer_name), ''), 'Prenotazione') || ' — ' || coalesce(new.service_name, 'Sessione'), new.contact_id,
          coalesce((select source from contacts where id = new.contact_id), 'direct'), 'event',
          new.starts_at::date, new.participants, new.total_cents, new.id, case when v_lost then 'Prenotazione annullata' end)
  on conflict (booking_id) where booking_id is not null do update set
    contact_id = coalesce(excluded.contact_id, opportunities.contact_id),
    name = excluded.name, event_date = excluded.event_date, attendees = excluded.attendees, agreed_value_cents = excluded.agreed_value_cents;
  if tg_op = 'UPDATE' and (new.status = 'cancelled') is distinct from (old.status = 'cancelled') then
    update opportunities set stage_id = st, lost_reason = case when v_lost then 'Prenotazione annullata' end where booking_id = new.id;
  end if;
  return null;
end $$;
