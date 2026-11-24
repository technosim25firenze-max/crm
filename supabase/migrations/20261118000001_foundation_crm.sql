-- TechnoSim25 CRM — Fase 1-2: fondamenta e CRM base.
-- Importi futuri in centesimi (integer). Timestamp in UTC.

create type app_role as enum ('owner', 'admin', 'marketing', 'staff');

-- ---------------------------------------------------------------- utility
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Normalizzazione telefono (IT): solo cifre, senza prefisso internazionale 0039/39.
create function normalize_phone(p text) returns text language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if d like '0039%' then d := substr(d, 5);
  elsif d like '39%' and length(d) >= 11 then d := substr(d, 3);
  end if;
  return nullif(d, '');
end $$;

-- ---------------------------------------------------------------- profili e ruoli
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role app_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Il primo utente diventa owner, tutti gli altri staff (minimo privilegio).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from profiles) then 'staff'::app_role else 'owner'::app_role end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function current_app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function has_role(variadic roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() = any (roles), false)
$$;

-- ---------------------------------------------------------------- impostazioni
create table organization_settings (
  id boolean primary key default true check (id),
  name text not null default 'TechnoSim25',
  timezone text not null default 'Europe/Rome',
  currency text not null default 'EUR',
  locale text not null default 'it-IT',
  inactivity_days integer not null default 180 check (inactivity_days > 0),
  updated_at timestamptz not null default now()
);
insert into organization_settings default values;
create trigger organization_settings_updated before update on organization_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- audit
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  table_name text not null,
  record_id text,
  action text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_table_idx on audit_logs (table_name, created_at desc);

-- Registra solo i campi cambiati (per update) per limitare i dati personali nei log.
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare diff jsonb; rid text;
begin
  if tg_op = 'DELETE' then
    rid := (to_jsonb(old) ->> 'id');
    insert into audit_logs (actor_id, table_name, record_id, action)
    values (auth.uid(), tg_table_name, rid, 'delete');
    return old;
  elsif tg_op = 'UPDATE' then
    rid := (to_jsonb(new) ->> 'id');
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}')
      into diff
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
      where n.value is distinct from o.value and n.key <> 'updated_at';
    if diff <> '{}'::jsonb then
      insert into audit_logs (actor_id, table_name, record_id, action, changes)
      values (auth.uid(), tg_table_name, rid, 'update', diff);
    end if;
    return new;
  else
    rid := (to_jsonb(new) ->> 'id');
    insert into audit_logs (actor_id, table_name, record_id, action)
    values (auth.uid(), tg_table_name, rid, 'insert');
    return new;
  end if;
end $$;

create trigger profiles_audit after update on profiles for each row execute function audit_row();

-- ---------------------------------------------------------------- contatti
create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  display_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  email text,
  email_norm text generated always as (nullif(lower(btrim(email)), '')) stored,
  phone text,
  phone_norm text generated always as (normalize_phone(phone)) stored,
  preferred_channel text check (preferred_channel in ('email', 'phone', 'whatsapp')),
  language text not null default 'it',
  city text,
  country text,
  job_title text,
  kind text not null default 'b2c' check (kind in ('b2c', 'b2b', 'partner', 'supplier')),
  lifecycle text not null default 'prospect'
    check (lifecycle in ('prospect', 'active', 'returning', 'vip', 'inactive')),
  -- acquisizione (preserva l'incertezza: 'unknown' è un valore valido)
  source text not null default 'unknown' check (source in (
    'website_form', 'landing_page', 'meta_lead_ads', 'google_ads', 'google_organic', 'direct',
    'instagram_organic', 'facebook_organic', 'referral', 'walk_in', 'phone', 'partner',
    'manual', 'import', 'unknown')),
  source_detail text,
  campaign text,
  utm jsonb not null default '{}'::jsonb,
  attribution_status text not null default 'unknown'
    check (attribution_status in ('unknown', 'pre_crm', 'marketing', 'independent')),
  first_seen_at timestamptz not null default now(),
  external_ids jsonb not null default '{}'::jsonb,
  sim_preferences text,
  -- privacy
  do_not_contact boolean not null default false,
  privacy_notice_version text,
  privacy_notice_at timestamptz,
  -- gestione
  assigned_to uuid references profiles (id) on delete set null,
  archived_at timestamptz,
  merged_into uuid references contacts (id),
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_has_name check (
    coalesce(btrim(first_name), '') <> '' or coalesce(btrim(last_name), '') <> ''
  )
);
create index contacts_email_idx on contacts (email_norm) where email_norm is not null;
create index contacts_phone_idx on contacts (phone_norm) where phone_norm is not null;
create index contacts_created_idx on contacts (created_at desc);
create index contacts_active_idx on contacts (archived_at) where archived_at is null;
create trigger contacts_updated before update on contacts for each row execute function set_updated_at();
create trigger contacts_audit after insert or update or delete on contacts for each row execute function audit_row();

-- Solo owner/admin possono archiviare o unire contatti.
create function guard_archive() returns trigger language plpgsql as $$
begin
  if (new.archived_at is distinct from old.archived_at or new.merged_into is distinct from old.merged_into)
     and not has_role('owner', 'admin') then
    raise exception 'Solo owner e admin possono archiviare o unire' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger contacts_guard_archive before update on contacts for each row execute function guard_archive();

-- ---------------------------------------------------------------- aziende
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  vat_number text,
  industry text,
  website text,
  phone text,
  email text,
  address text,
  city text,
  size_category text,
  source text not null default 'unknown',
  owner_id uuid references profiles (id) on delete set null,
  first_contact_at timestamptz,
  archived_at timestamptz,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_name_idx on companies (lower(name));
create trigger companies_updated before update on companies for each row execute function set_updated_at();
create trigger companies_audit after insert or update or delete on companies for each row execute function audit_row();
create trigger companies_guard_archive before update on companies for each row execute function guard_archive();

create table company_contacts (
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (company_id, contact_id)
);
create index company_contacts_contact_idx on company_contacts (contact_id);

-- ---------------------------------------------------------------- tag
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  color text,
  created_at timestamptz not null default now()
);
create unique index tags_name_uq on tags (lower(name));
create table contact_tags (
  contact_id uuid not null references contacts (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (contact_id, tag_id)
);
create table company_tags (
  company_id uuid not null references companies (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (company_id, tag_id)
);

-- ---------------------------------------------------------------- note, documenti, attività
create table notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  body text not null check (btrim(body) <> ''),
  author_id uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(contact_id, company_id) = 1)
);
create index notes_contact_idx on notes (contact_id, created_at desc);
create index notes_company_idx on notes (company_id, created_at desc);
create trigger notes_updated before update on notes for each row execute function set_updated_at();

create table documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  category text,
  url text,                -- link esterno (Google Drive, preventivo…)
  storage_path text,       -- file nel bucket privato "documents"
  uploaded_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(contact_id, company_id) = 1),
  check (num_nonnulls(url, storage_path) = 1)
);
create index documents_contact_idx on documents (contact_id);
create index documents_company_idx on documents (company_id);

create table activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  type text not null,
  summary text not null,
  actor_id uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(contact_id, company_id) >= 1)
);
create index activities_contact_idx on activities (contact_id, created_at desc);
create index activities_company_idx on activities (company_id, created_at desc);

-- ---------------------------------------------------------------- consensi (append-only)
create table marketing_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'phone')),
  status text not null check (status in ('granted', 'withdrawn')),
  evidence text,           -- come/dove è stato ottenuto (modulo, data, canale)
  recorded_by uuid references profiles (id) on delete set null default auth.uid(),
  recorded_at timestamptz not null default now()
);
create index marketing_consents_contact_idx on marketing_consents (contact_id, channel, recorded_at desc);
create trigger marketing_consents_audit after insert on marketing_consents for each row execute function audit_row();

-- ---------------------------------------------------------------- import
create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  filename text,
  total_rows integer not null default 0,
  created_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- unione contatti
-- Esplicita e atomica: tiene `keep`, sposta i dati collegati, archivia `drop`.
create function merge_contacts(keep uuid, drop_id uuid) returns void
language plpgsql as $$
begin
  if not has_role('owner', 'admin') then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;
  if keep = drop_id then
    raise exception 'Impossibile unire un contatto con sé stesso';
  end if;
  if exists (select 1 from contacts where id in (keep, drop_id) and archived_at is not null) then
    raise exception 'Uno dei contatti è già archiviato';
  end if;

  update contacts k set
    first_name = coalesce(nullif(k.first_name, ''), d.first_name),
    last_name = coalesce(nullif(k.last_name, ''), d.last_name),
    email = coalesce(nullif(k.email, ''), d.email),
    phone = coalesce(nullif(k.phone, ''), d.phone),
    city = coalesce(k.city, d.city),
    country = coalesce(k.country, d.country),
    job_title = coalesce(k.job_title, d.job_title),
    sim_preferences = coalesce(k.sim_preferences, d.sim_preferences),
    do_not_contact = k.do_not_contact or d.do_not_contact,
    first_seen_at = least(k.first_seen_at, d.first_seen_at),
    external_ids = d.external_ids || k.external_ids
  from contacts d where k.id = keep and d.id = drop_id;

  update notes set contact_id = keep where contact_id = drop_id;
  update documents set contact_id = keep where contact_id = drop_id;
  update activities set contact_id = keep where contact_id = drop_id;
  update marketing_consents set contact_id = keep where contact_id = drop_id;
  insert into company_contacts (company_id, contact_id, role, is_primary)
    select company_id, keep, role, is_primary from company_contacts where contact_id = drop_id
    on conflict do nothing;
  delete from company_contacts where contact_id = drop_id;
  insert into contact_tags (contact_id, tag_id)
    select keep, tag_id from contact_tags where contact_id = drop_id on conflict do nothing;
  delete from contact_tags where contact_id = drop_id;

  update contacts set archived_at = now(), merged_into = keep where id = drop_id;
  insert into activities (contact_id, type, summary)
    values (keep, 'merged', 'Contatto duplicato unito a questo profilo');
end $$;

-- ---------------------------------------------------------------- RLS
alter table profiles enable row level security;
alter table organization_settings enable row level security;
alter table audit_logs enable row level security;
alter table contacts enable row level security;
alter table companies enable row level security;
alter table company_contacts enable row level security;
alter table tags enable row level security;
alter table contact_tags enable row level security;
alter table company_tags enable row level security;
alter table notes enable row level security;
alter table documents enable row level security;
alter table activities enable row level security;
alter table marketing_consents enable row level security;
alter table import_jobs enable row level security;

-- profili: tutti gli utenti attivi vedono il team; solo owner modifica.
create policy profiles_read on profiles for select using (current_app_role() is not null);
create policy profiles_update on profiles for update using (has_role('owner')) with check (has_role('owner'));

create policy settings_read on organization_settings for select using (current_app_role() is not null);
create policy settings_update on organization_settings for update using (has_role('owner')) with check (has_role('owner'));

create policy audit_read on audit_logs for select using (has_role('owner', 'admin'));

-- contatti e aziende
create policy contacts_read on contacts for select using (current_app_role() is not null);
create policy contacts_insert on contacts for insert with check (current_app_role() is not null);
create policy contacts_update on contacts for update using (current_app_role() is not null) with check (current_app_role() is not null);
create policy contacts_delete on contacts for delete using (has_role('owner', 'admin'));

create policy companies_read on companies for select using (current_app_role() is not null);
create policy companies_insert on companies for insert with check (current_app_role() is not null);
create policy companies_update on companies for update using (current_app_role() is not null) with check (current_app_role() is not null);
create policy companies_delete on companies for delete using (has_role('owner', 'admin'));

-- associazioni e tag
create policy company_contacts_all on company_contacts for all using (current_app_role() is not null) with check (current_app_role() is not null);
create policy contact_tags_all on contact_tags for all using (current_app_role() is not null) with check (current_app_role() is not null);
create policy company_tags_all on company_tags for all using (current_app_role() is not null) with check (current_app_role() is not null);
create policy tags_read on tags for select using (current_app_role() is not null);
create policy tags_insert on tags for insert with check (current_app_role() is not null);
create policy tags_update on tags for update using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));
create policy tags_delete on tags for delete using (has_role('owner', 'admin'));

-- note e documenti: tutti leggono e scrivono; modifica/eliminazione solo dell'autore o owner/admin.
create policy notes_read on notes for select using (current_app_role() is not null);
create policy notes_insert on notes for insert with check (current_app_role() is not null and author_id = auth.uid());
create policy notes_update on notes for update using (author_id = auth.uid() or has_role('owner', 'admin'))
  with check (author_id = auth.uid() or has_role('owner', 'admin'));
create policy notes_delete on notes for delete using (author_id = auth.uid() or has_role('owner', 'admin'));

create policy documents_read on documents for select using (current_app_role() is not null);
create policy documents_insert on documents for insert with check (current_app_role() is not null and uploaded_by = auth.uid());
create policy documents_delete on documents for delete using (uploaded_by = auth.uid() or has_role('owner', 'admin'));

create policy activities_read on activities for select using (current_app_role() is not null);
create policy activities_insert on activities for insert with check (current_app_role() is not null);

-- consensi: append-only; staff può solo leggere.
create policy consents_read on marketing_consents for select using (current_app_role() is not null);
create policy consents_insert on marketing_consents for insert with check (has_role('owner', 'admin', 'marketing'));

create policy import_jobs_all on import_jobs for all using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));

-- Privilegi tabella per i ruoli Supabase (RLS filtra le righe).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke all on audit_logs from authenticated;
grant select on audit_logs to authenticated;
