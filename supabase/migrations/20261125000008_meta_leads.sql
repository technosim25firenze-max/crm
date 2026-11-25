-- Lead da moduli Facebook/Instagram (inviati da Make): contatto, azienda, nota con le risposte e trattativa B2B.
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

  select id into v_pipeline from pipelines where kind = 'b2b';
  select id into v_stage from pipeline_stages where pipeline_id = v_pipeline and kind = 'open' order by position limit 1;
  insert into opportunities (pipeline_id, stage_id, name, contact_id, company_id, owner_id, source, event_type, attendees, created_by)
  values (v_pipeline, v_stage, coalesce(v_company_name, v_name, v_email, 'Lead') || ' — ' || coalesce(nullif(btrim(p ->> 'event_type'), ''), 'Evento'),
          v_contact, v_company, null, v_src, nullif(btrim(p ->> 'event_type'), ''), nullif(p ->> 'attendees', '')::int, null)
  returning id into v_opp;
  return v_opp;
end $$;
revoke execute on function upsert_lead(jsonb) from public, authenticated;
