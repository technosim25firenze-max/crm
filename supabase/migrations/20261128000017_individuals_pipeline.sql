-- Seconda pipeline, identica a quella degli eventi, per le persone singole. Il campo `opportunities.kind`
-- ("event" | "individual") decide in quale pipeline sta la scheda; cambiandolo, la scheda passa all'altra pipeline.
alter table pipelines drop constraint if exists pipelines_kind_check;
alter table pipelines add constraint pipelines_kind_check check (kind in ('b2b', 'b2c', 'sales', 'individuals'));

do $$
declare ev uuid; ind uuid;
begin
  select id into ev from pipelines where kind = 'sales';
  update pipelines set name = 'Eventi' where id = ev;
  insert into pipelines (name, kind) values ('Individuali', 'individuals') returning id into ind;
  insert into pipeline_stages (pipeline_id, name, position, kind)
  select ind, name, position, kind from pipeline_stages where pipeline_id = ev;

  -- Le schede nate da prenotazioni del sito sono sessioni singole: passano alla pipeline Individuali (stessa fase, per nome).
  alter table opportunities disable trigger user;
  update opportunities o set kind = 'individual', pipeline_id = ind,
    stage_id = (select s2.id from pipeline_stages s1 join pipeline_stages s2 on s2.name = s1.name and s2.pipeline_id = ind where s1.id = o.stage_id)
  where o.booking_id is not null;
  alter table opportunities enable trigger user;
end $$;

-- Le prenotazioni (non di prova) creano la scheda nella pipeline Individuali, fase "Prenotato" (o "Non interessato" se annullata).
create or replace function booking_sync_opportunity() returns trigger language plpgsql security definer set search_path = public as $$
declare p uuid; st uuid; v_lost boolean;
begin
  if new.is_test then
    delete from opportunities where booking_id = new.id;
    return null;
  end if;
  select id into p from pipelines where kind = 'individuals';
  if p is null then return null; end if;
  v_lost := new.status = 'cancelled';
  select id into st from pipeline_stages where pipeline_id = p and kind = case when v_lost then 'lost' else 'won' end order by position limit 1;
  insert into opportunities (pipeline_id, stage_id, name, contact_id, source, kind, event_date, attendees, agreed_value_cents, booking_id, lost_reason)
  values (p, st, coalesce(nullif(btrim(new.customer_name), ''), 'Prenotazione') || ' — ' || coalesce(new.service_name, 'Sessione'), new.contact_id,
          coalesce((select source from contacts where id = new.contact_id), 'direct'), 'individual',
          new.starts_at::date, new.participants, new.total_cents, new.id, case when v_lost then 'Prenotazione annullata' end)
  on conflict (booking_id) where booking_id is not null do update set
    contact_id = coalesce(excluded.contact_id, opportunities.contact_id),
    name = excluded.name, event_date = excluded.event_date, attendees = excluded.attendees, agreed_value_cents = excluded.agreed_value_cents;
  if tg_op = 'UPDATE' and (new.status = 'cancelled') is distinct from (old.status = 'cancelled') then
    update opportunities set stage_id = st, lost_reason = case when v_lost then 'Prenotazione annullata' end where booking_id = new.id;
  end if;
  return null;
end $$;
