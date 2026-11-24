-- Prenotazioni ricevute via webhook JSON. Importi in centesimi.
-- Una prenotazione NON è un incasso: paid_cents verrà ricalcolato dai pagamenti nella fase Finanze.

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  dedupe_key text not null,              -- event_id del mittente oppure hash SHA-256 del body
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'unmapped', 'failed')),
  attempts integer not null default 0,
  last_error text,
  booking_id uuid,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, dedupe_key)
);
create index webhook_events_status_idx on webhook_events (provider, status, received_at desc);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'website',
  external_id text not null,
  contact_id uuid references contacts (id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  service_name text,
  resource_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  participants integer check (participants is null or participants > 0),
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'failed')),
  total_cents integer check (total_cents is null or total_cents >= 0),   -- lordo IVA inclusa
  vat_cents integer check (vat_cents is null or vat_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  currency text not null default 'EUR',
  notes text,
  last_event_at timestamptz not null default now(),   -- evento più recente applicato (protegge dagli eventi fuori ordine)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);
create index bookings_starts_idx on bookings (starts_at desc);
create index bookings_contact_idx on bookings (contact_id);
create trigger bookings_updated before update on bookings for each row execute function set_updated_at();

alter table webhook_events
  add constraint webhook_events_booking_fk foreign key (booking_id) references bookings (id) on delete set null;

-- Applica un evento prenotazione in modo atomico e idempotente.
-- - collega o crea il contatto (match per email, poi telefono solo se univoco; mai per nome)
-- - ignora gli eventi più vecchi dell'ultimo già applicato
create function upsert_booking(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_source text := coalesce(nullif(p ->> 'source', ''), 'website');
  v_ext text := nullif(p ->> 'external_id', '');
  v_event_at timestamptz := coalesce((p ->> 'event_at')::timestamptz, now());
  v_email text := nullif(lower(btrim(p ->> 'customer_email')), '');
  v_phone text := normalize_phone(p ->> 'customer_phone');
  v_name text := nullif(btrim(p ->> 'customer_name'), '');
  v_contact uuid;
  v_id uuid;
begin
  if v_ext is null then raise exception 'external_id mancante'; end if;

  if v_email is not null then
    select id into v_contact from contacts where email_norm = v_email and archived_at is null order by created_at limit 1;
  end if;
  if v_contact is null and v_phone is not null then
    select id into v_contact from contacts where phone_norm = v_phone and archived_at is null
      and (select count(*) from contacts where phone_norm = v_phone and archived_at is null) = 1;
  end if;
  if v_contact is null and v_name is not null then
    insert into contacts (first_name, last_name, email, phone, kind, lifecycle, source, attribution_status)
    values (split_part(v_name, ' ', 1), nullif(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
            nullif(btrim(p ->> 'customer_email'), ''), nullif(btrim(p ->> 'customer_phone'), ''),
            'b2c', 'active', 'direct', 'unknown')
    returning id into v_contact;
  end if;

  insert into bookings (source, external_id, contact_id, customer_name, customer_email, customer_phone, service_name,
    resource_name, starts_at, ends_at, participants, status, payment_status, total_cents, vat_cents, paid_cents,
    currency, notes, last_event_at)
  values (v_source, v_ext, v_contact, v_name, p ->> 'customer_email', p ->> 'customer_phone', p ->> 'service_name',
    p ->> 'resource_name', (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz,
    (p ->> 'participants')::int, coalesce(p ->> 'status', 'confirmed'), coalesce(p ->> 'payment_status', 'unpaid'),
    (p ->> 'total_cents')::int, (p ->> 'vat_cents')::int, coalesce((p ->> 'paid_cents')::int, 0),
    coalesce(p ->> 'currency', 'EUR'), p ->> 'notes', v_event_at)
  on conflict (source, external_id) do update set
    contact_id = coalesce(bookings.contact_id, excluded.contact_id),
    customer_name = excluded.customer_name, customer_email = excluded.customer_email, customer_phone = excluded.customer_phone,
    service_name = excluded.service_name, resource_name = excluded.resource_name,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, participants = excluded.participants,
    status = excluded.status, payment_status = excluded.payment_status, total_cents = excluded.total_cents,
    vat_cents = excluded.vat_cents, paid_cents = excluded.paid_cents, currency = excluded.currency,
    notes = excluded.notes, last_event_at = excluded.last_event_at
  where bookings.last_event_at <= excluded.last_event_at
  returning id into v_id;

  if v_id is null then  -- evento obsoleto: lo stato più recente resta invariato
    select id into v_id from bookings where source = v_source and external_id = v_ext;
  end if;
  return v_id;
end $$;
revoke execute on function upsert_booking(jsonb) from public, authenticated;

alter table webhook_events enable row level security;
alter table bookings enable row level security;
create policy bookings_read on bookings for select using (current_app_role() is not null);
create policy webhook_events_read on webhook_events for select using (has_role('owner', 'admin'));
-- Scrittura solo dal server con chiave di servizio (endpoint webhook): nessuna policy di insert/update per gli utenti.

revoke all on webhook_events from authenticated;
grant select on webhook_events to authenticated;
revoke all on bookings from authenticated;
grant select on bookings to authenticated;
