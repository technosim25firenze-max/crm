-- Prenotazioni di prova: salvate ma nascoste di default e escluse da contatti, pagamenti e statistiche.
alter table bookings add column is_test boolean not null default false;
create index bookings_test_idx on bookings (is_test) where is_test;

-- ignora eventi più vecchi dell'ultimo applicato, replica l'incassato dichiarato come pagamento "booking_platform".
create or replace function upsert_booking(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_source text := coalesce(nullif(p ->> 'source', ''), 'website');
  v_ext text := nullif(p ->> 'external_id', '');
  v_event_at timestamptz := coalesce((p ->> 'event_at')::timestamptz, now());
  v_email text := nullif(lower(btrim(p ->> 'customer_email')), '');
  v_phone text := normalize_phone(p ->> 'customer_phone');
  v_name text := nullif(btrim(p ->> 'customer_name'), '');
  v_surname text := nullif(btrim(p ->> 'customer_surname'), '');
  v_attr jsonb := coalesce(p -> 'attribution', '{}'::jsonb);
  v_consent jsonb := p -> 'marketing_consent';
  v_paid integer := coalesce((p ->> 'paid_cents')::int, 0);
  v_test boolean := coalesce((p ->> 'is_test')::boolean, false);
  v_contact uuid;
  v_id uuid;
  v_existing bigint;
  v_first text;
  v_last text;
  v_src text;
begin
  if v_ext is null then raise exception 'external_id mancante'; end if;

  -- Le prenotazioni di prova non toccano contatti, consensi né pagamenti.
  if v_email is not null and not v_test then
    select id into v_contact from contacts where email_norm = v_email and archived_at is null order by created_at limit 1;
  end if;
  if v_contact is null and v_phone is not null and not v_test then
    select id into v_contact from contacts where phone_norm = v_phone and archived_at is null
      and (select count(*) from contacts where phone_norm = v_phone and archived_at is null) = 1;
  end if;
  if v_contact is null and not v_test and (v_name is not null or v_surname is not null) then
    if v_surname is not null then v_first := v_name; v_last := v_surname;
    else v_first := split_part(v_name, ' ', 1); v_last := nullif(btrim(substr(v_name, length(v_first) + 1)), '');
    end if;
    v_src := attribution_source(v_attr ->> 'utm_source', v_attr ->> 'utm_medium');
    insert into contacts (first_name, last_name, email, phone, kind, lifecycle, source, source_detail, campaign, utm, attribution_status)
    values (v_first, v_last, nullif(btrim(p ->> 'customer_email'), ''), nullif(btrim(p ->> 'customer_phone'), ''), 'b2c', 'active',
            v_src, nullif(v_attr ->> 'landing_page', ''), nullif(v_attr ->> 'utm_campaign', ''), v_attr,
            case when v_src in ('google_ads', 'meta_ads') then 'marketing' else 'unknown' end)
    returning id into v_contact;
  end if;

  insert into bookings (source, external_id, contact_id, customer_name, customer_email, customer_phone, service_name,
    resource_name, starts_at, ends_at, participants, status, payment_status, total_cents, vat_cents, paid_cents,
    currency, notes, last_event_at, booking_number, checkout_id, details, attribution, is_test)
  values (v_source, v_ext, v_contact, concat_ws(' ', v_name, v_surname), p ->> 'customer_email', p ->> 'customer_phone', p ->> 'service_name',
    p ->> 'resource_name', (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz,
    (p ->> 'participants')::int, coalesce(p ->> 'status', 'confirmed'), coalesce(p ->> 'payment_status', 'unpaid'),
    (p ->> 'total_cents')::int, (p ->> 'vat_cents')::int, v_paid,
    coalesce(p ->> 'currency', 'EUR'), p ->> 'notes', v_event_at, (p ->> 'booking_number')::int, p ->> 'checkout_id',
    coalesce(p -> 'details', '{}'::jsonb), v_attr, v_test)
  on conflict (source, external_id) do update set
    contact_id = coalesce(bookings.contact_id, excluded.contact_id),
    customer_name = excluded.customer_name, customer_email = excluded.customer_email, customer_phone = excluded.customer_phone,
    service_name = excluded.service_name, resource_name = excluded.resource_name,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, participants = excluded.participants,
    status = excluded.status, payment_status = excluded.payment_status, total_cents = excluded.total_cents,
    vat_cents = excluded.vat_cents, paid_cents = excluded.paid_cents, currency = excluded.currency,
    notes = excluded.notes, last_event_at = excluded.last_event_at, booking_number = excluded.booking_number,
    checkout_id = excluded.checkout_id, details = excluded.details, attribution = excluded.attribution, is_test = excluded.is_test
  where bookings.last_event_at <= excluded.last_event_at
  returning id into v_id;

  if v_id is null then  -- evento obsoleto: lo stato più recente resta invariato
    select id into v_id from bookings where source = v_source and external_id = v_ext;
    return v_id;
  end if;

  -- Consenso marketing dichiarato dal modulo di prenotazione (canale presunto: email, serve un indirizzo).
  if not v_test and v_consent is not null and jsonb_typeof(v_consent) = 'object' and v_contact is not null and v_email is not null then
    insert into marketing_consents (contact_id, channel, status, evidence, recorded_at)
    select v_contact, 'email', 'granted',
      'Consenso dal modulo di prenotazione online (versione testo: ' || coalesce(v_consent ->> 'text_version', 'n/d') || '; canale presunto: email)',
      coalesce((v_consent ->> 'granted_at')::timestamptz, now())
    where not exists (select 1 from marketing_consents m where m.contact_id = v_contact and m.channel = 'email'
                      and m.recorded_at = coalesce((v_consent ->> 'granted_at')::timestamptz, m.recorded_at - interval '1 second'));
  end if;

  -- Incassato dichiarato dalla piattaforma → pagamenti (solo la quota nuova, idempotente per prenotazione).
  if not v_test and v_paid > 0 and (select import_platform_payments from organization_settings limit 1) then
    select coalesce(sum(amount_cents), 0) into v_existing from payments where source = 'booking_platform' and booking_id = v_id and kind = 'payment';
    if v_paid > v_existing then
      insert into payments (kind, contact_id, booking_id, amount_cents, vat_rate, method, paid_at, reference, source, external_id)
      values ('payment', v_contact, v_id, v_paid - v_existing::int, 22, 'other', v_event_at,
              'Prenotazione online' || coalesce(' #' || (p ->> 'booking_number'), ''), 'booking_platform', v_ext || '#' || v_paid)
      on conflict do nothing;
    end if;
  end if;
  return v_id;
end $$;
revoke execute on function upsert_booking(jsonb) from public, authenticated;
