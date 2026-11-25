-- Un'unica pipeline di vendita. Ogni scheda (trattativa) è "individual" (sessione singola) oppure "event" (evento privato o aziendale).
-- Fasi: Da contattare → Chiamato → Messaggio inviato → Visita prenotata → Preventivo inviato → Follow-up → Chiuso / Perso.
-- Sostituisce la bacheca lead sui contatti (contacts.lead_stage) e le pipeline separate B2B/B2C.
-- Le prenotazioni del sito creano una scheda individuale già "Chiuso", con valore e incassi collegati.

alter table opportunities add column kind text not null default 'event' check (kind in ('individual', 'event'));
alter table opportunities add column booking_id uuid references bookings (id) on delete set null;
create unique index opportunities_booking_uq on opportunities (booking_id) where booking_id is not null;
update opportunities o set kind = 'individual' from pipelines p where p.id = o.pipeline_id and p.kind = 'b2c';

alter table pipelines drop constraint if exists pipelines_kind_check;
alter table pipelines add constraint pipelines_kind_check check (kind in ('b2b', 'b2c', 'sales'));

do $$
declare
  p uuid;
  n text; i int := 0;
begin
  select id into p from pipelines where kind = 'b2b';
  update pipelines set kind = 'sales', name = 'Vendite' where id = p;

  -- Nuove fasi (posizioni provvisorie) e mappa delle vecchie fasi → nuove.
  foreach n in array array['Da contattare', 'Chiamato', 'Messaggio inviato', 'Visita prenotata', 'Preventivo inviato', 'Follow-up'] loop
    i := i + 1; insert into pipeline_stages (pipeline_id, name, position) values (p, n, 100 + i);
  end loop;
  insert into pipeline_stages (pipeline_id, name, position, kind) values (p, 'Chiuso', 107, 'won'), (p, 'Perso', 108, 'lost');

  create temp table stage_map on commit drop as
  select o.id as old_id,
    (select s.id from pipeline_stages s where s.pipeline_id = p and s.position > 100 and s.name = case
      when o.name in ('Nuovo contatto', 'Nuova richiesta', 'Da ricontattare') then 'Da contattare'
      when o.name in ('Contattato', 'Qualificato', 'Interessato') then 'Chiamato'
      when o.name = 'Informazioni inviate' then 'Messaggio inviato'
      when o.name in ('Incontro / sopralluogo', 'Requisiti raccolti') then 'Visita prenotata'
      when o.name in ('Preventivo in preparazione', 'Preventivo inviato') then 'Preventivo inviato'
      when o.kind = 'won' then 'Chiuso'
      when o.kind = 'lost' then 'Perso'
      else 'Follow-up' end) as new_id
  from pipeline_stages o where o.position <= 100;

  -- Spostamento senza effetti collaterali (chiusura e cronologia restano quelle originali).
  alter table opportunities disable trigger user;
  update opportunities o set pipeline_id = p, stage_id = m.new_id from stage_map m where o.stage_id = m.old_id;
  alter table opportunities enable trigger user;
  update opportunity_stage_history h set from_stage_id = m.new_id from stage_map m where h.from_stage_id = m.old_id;
  update opportunity_stage_history h set to_stage_id = m.new_id from stage_map m where h.to_stage_id = m.old_id;

  delete from pipeline_stages where position <= 100;
  delete from pipelines where kind = 'b2c';
  update pipeline_stages set position = position - 100 where pipeline_id = p;

  -- La fase scelta nella vecchia bacheca lead prevale: l'ultima scheda del contatto segue lead_stage.
  update opportunities o set stage_id = s.id
  from (select distinct on (o2.contact_id) o2.id as oid, c.lead_stage
        from opportunities o2 join contacts c on c.id = o2.contact_id
        where c.lead_stage is not null order by o2.contact_id, o2.created_at desc) x
  join pipeline_stages s on s.pipeline_id = p and s.name = case x.lead_stage
    when 'to_contact' then 'Da contattare' when 'called' then 'Chiamato' when 'message_sent' then 'Messaggio inviato'
    when 'visit_booked' then 'Visita prenotata' when 'quote_sent' then 'Preventivo inviato' when 'follow_up' then 'Follow-up'
    when 'closed' then 'Chiuso' else 'Perso' end
  where o.id = x.oid;

  -- Lead senza trattativa: ne ottengono una (individuale), nella fase in cui erano.
  insert into opportunities (pipeline_id, stage_id, name, contact_id, source, kind)
  select p, s.id, c.display_name, c.id, c.source, 'individual'
  from contacts c
  join pipeline_stages s on s.pipeline_id = p and s.name = case c.lead_stage
    when 'to_contact' then 'Da contattare' when 'called' then 'Chiamato' when 'message_sent' then 'Messaggio inviato'
    when 'visit_booked' then 'Visita prenotata' when 'quote_sent' then 'Preventivo inviato' when 'follow_up' then 'Follow-up'
    when 'closed' then 'Chiuso' else 'Perso' end
  where c.lead_stage is not null and c.archived_at is null
    and not exists (select 1 from opportunities x where x.contact_id = c.id);
end $$;

drop index if exists contacts_lead_stage_idx;
alter table contacts drop column lead_stage;

-- Nuovi lead Meta: scheda "evento" in "Da contattare".
create or replace function upsert_lead(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(lower(btrim(p ->> 'email')), '');
  v_phone text := normalize_phone(p ->> 'phone');
  v_name text := nullif(btrim(p ->> 'name'), '');
  v_company_name text := nullif(btrim(p ->> 'company'), '');
  v_organic boolean := coalesce((p ->> 'is_organic')::boolean, false);
  v_src text := case when coalesce((p ->> 'is_organic')::boolean, false) then 'facebook_organic' else 'meta_lead_ads' end;
  v_contact uuid; v_company uuid; v_pipeline uuid; v_stage uuid; v_opp uuid;
  v_first text; v_last text;
begin
  if v_email is null and v_phone is null and v_name is null then raise exception 'lead senza nome, email né telefono'; end if;

  if v_email is not null then
    select id into v_contact from contacts where email_norm = v_email and archived_at is null order by created_at limit 1;
  end if;
  if v_contact is null and v_phone is not null then
    select id into v_contact from contacts where phone_norm = v_phone and archived_at is null
      and (select count(*) from contacts where phone_norm = v_phone and archived_at is null) = 1;
  end if;
  if v_contact is null then
    v_first := split_part(coalesce(v_name, split_part(coalesce(v_email, ''), '@', 1), 'Lead'), ' ', 1);
    v_last := nullif(btrim(substr(coalesce(v_name, ''), length(v_first) + 1)), '');
    if v_first = '' then v_first := 'Lead'; end if;
    insert into contacts (first_name, last_name, email, phone, kind, lifecycle, source, source_detail, campaign, utm, attribution_status)
    values (v_first, v_last, nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'phone'), ''),
            case when v_company_name is not null then 'b2b' else 'b2c' end, 'prospect', v_src,
            'Modulo Meta ' || coalesce(p ->> 'form_id', ''), null,
            jsonb_strip_nulls(jsonb_build_object('leadgen_id', p ->> 'lead_id', 'form_id', p ->> 'form_id', 'page_id', p ->> 'page_id')),
            case when v_organic then 'unknown' else 'marketing' end)
    returning id into v_contact;
  end if;

  if v_company_name is not null then
    select id into v_company from companies where lower(name) = lower(v_company_name) and archived_at is null order by created_at limit 1;
    if v_company is null then
      insert into companies (name, source) values (v_company_name, v_src) returning id into v_company;
    end if;
    insert into company_contacts (company_id, contact_id) values (v_company, v_contact) on conflict do nothing;
  end if;

  if nullif(btrim(p ->> 'note'), '') is not null then
    insert into notes (contact_id, body) values (v_contact, p ->> 'note');
  end if;

  select id into v_pipeline from pipelines where kind = 'sales';
  select id into v_stage from pipeline_stages where pipeline_id = v_pipeline and kind = 'open' order by position limit 1;
  insert into opportunities (pipeline_id, stage_id, name, contact_id, company_id, owner_id, source, kind, event_type, attendees, created_by)
  values (v_pipeline, v_stage, coalesce(v_company_name, v_name, v_email, 'Lead') || ' — ' || coalesce(nullif(btrim(p ->> 'event_type'), ''), 'Evento'),
          v_contact, v_company, null, v_src, 'event', nullif(btrim(p ->> 'event_type'), ''), nullif(p ->> 'attendees', '')::int, null)
  returning id into v_opp;
  return v_opp;
end $$;
revoke execute on function upsert_lead(jsonb) from public, authenticated;

-- Prenotazioni (non di prova) → scheda individuale "Chiuso" (o "Perso" se annullata), valore = totale prenotazione.
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
          coalesce((select source from contacts where id = new.contact_id), 'direct'), 'individual',
          new.starts_at::date, new.participants, new.total_cents, new.id, case when v_lost then 'Prenotazione annullata' end)
  on conflict (booking_id) where booking_id is not null do update set
    contact_id = coalesce(excluded.contact_id, opportunities.contact_id),
    name = excluded.name, event_date = excluded.event_date, attendees = excluded.attendees, agreed_value_cents = excluded.agreed_value_cents;
  -- Annullata / ripristinata: la scheda segue lo stato della prenotazione.
  if tg_op = 'UPDATE' and (new.status = 'cancelled') is distinct from (old.status = 'cancelled') then
    update opportunities set stage_id = st, lost_reason = case when v_lost then 'Prenotazione annullata' end where booking_id = new.id;
  end if;
  return null;
end $$;
create trigger bookings_sync_opportunity after insert or update on bookings for each row execute function booking_sync_opportunity();

-- I pagamenti di una prenotazione compaiono anche sulla sua scheda.
create or replace function payments_link_opportunity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.opportunity_id is null and new.booking_id is not null then
    select id into new.opportunity_id from opportunities where booking_id = new.booking_id;
  end if;
  return new;
end $$;
create trigger payments_link_opportunity before insert on payments for each row execute function payments_link_opportunity();

-- Prenotazioni esistenti: una scheda ciascuna (il trigger si occupa di tutto) e pagamenti collegati.
update bookings set id = id where not is_test;
update payments p set opportunity_id = o.id from opportunities o where o.booking_id = p.booking_id and p.opportunity_id is null;
