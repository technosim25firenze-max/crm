-- Vendite, attività, finanze (pagamenti manuali, rimborsi, spese), spesa marketing.
-- Importi in centesimi. Un pagamento è un movimento di cassa: il valore di una prenotazione/trattativa NON è un incasso.

-- ---------------------------------------------------------------- pipeline
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null unique check (kind in ('b2b', 'b2c')),
  created_at timestamptz not null default now()
);
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  position integer not null,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  created_at timestamptz not null default now()
);
create index pipeline_stages_idx on pipeline_stages (pipeline_id, position);

do $$
declare b2b uuid; b2c uuid; n text; i int := 0;
begin
  insert into pipelines (name, kind) values ('Aziende (B2B)', 'b2b') returning id into b2b;
  insert into pipelines (name, kind) values ('Privati (B2C)', 'b2c') returning id into b2c;
  foreach n in array array['Nuovo contatto', 'Da ricontattare', 'Contattato', 'Qualificato', 'Incontro / sopralluogo', 'Requisiti raccolti',
    'Preventivo in preparazione', 'Preventivo inviato', 'Trattativa', 'In pausa'] loop
    i := i + 1; insert into pipeline_stages (pipeline_id, name, position) values (b2b, n, i);
  end loop;
  insert into pipeline_stages (pipeline_id, name, position, kind) values (b2b, 'Acquisita', i + 1, 'won'), (b2b, 'Persa', i + 2, 'lost');
  i := 0;
  foreach n in array array['Nuova richiesta', 'Contattato', 'Interessato', 'Informazioni inviate', 'In attesa di decisione'] loop
    i := i + 1; insert into pipeline_stages (pipeline_id, name, position) values (b2c, n, i);
  end loop;
  insert into pipeline_stages (pipeline_id, name, position, kind) values (b2c, 'Prenotata', i + 1, 'won'), (b2c, 'Persa', i + 2, 'lost');
end $$;

-- ---------------------------------------------------------------- servizi
create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  category text,
  default_price_cents integer check (default_price_cents is null or default_price_cents >= 0),
  vat_rate numeric(4, 1) not null default 22 check (vat_rate between 0 and 100),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- opportunità
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines (id),
  stage_id uuid not null references pipeline_stages (id),
  name text not null check (btrim(name) <> ''),
  contact_id uuid references contacts (id) on delete set null,
  company_id uuid references companies (id) on delete set null,
  owner_id uuid references profiles (id) on delete set null default auth.uid(),
  source text not null default 'manual',
  event_type text,
  event_date date,
  attendees integer check (attendees is null or attendees > 0),
  expected_value_cents integer check (expected_value_cents is null or expected_value_cents >= 0),
  agreed_value_cents integer check (agreed_value_cents is null or agreed_value_cents >= 0), -- valore concordato (IVA inclusa)
  probability integer check (probability is null or probability between 0 and 100),
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_stage_idx on opportunities (stage_id);
create index opportunities_contact_idx on opportunities (contact_id);
create index opportunities_company_idx on opportunities (company_id);
create trigger opportunities_updated before update on opportunities for each row execute function set_updated_at();
create trigger opportunities_audit after insert or update or delete on opportunities for each row execute function audit_row();

create table opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  from_stage_id uuid references pipeline_stages (id) on delete set null,
  to_stage_id uuid references pipeline_stages (id) on delete set null,
  changed_by uuid references profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index stage_history_idx on opportunity_stage_history (opportunity_id, changed_at);

-- Chiusura e cronologia automatiche: ogni passaggio di fase è registrato con utente e orario.
create function opportunity_before() returns trigger language plpgsql as $$
declare k text; p uuid;
begin
  select kind, pipeline_id into k, p from pipeline_stages where id = new.stage_id;
  if p is distinct from new.pipeline_id then raise exception 'La fase non appartiene alla pipeline'; end if;
  if k in ('won', 'lost') then
    new.closed_at := coalesce(case when tg_op = 'UPDATE' and old.stage_id = new.stage_id then old.closed_at end, now());
    if k = 'won' and new.agreed_value_cents is null then new.agreed_value_cents := new.expected_value_cents; end if;
    if k = 'won' then new.lost_reason := null; end if;
  else
    new.closed_at := null;
    new.lost_reason := null;
  end if;
  return new;
end $$;
create trigger opportunities_before before insert or update on opportunities for each row execute function opportunity_before();

create function opportunity_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into opportunity_stage_history (opportunity_id, to_stage_id, changed_by) values (new.id, new.stage_id, auth.uid());
  elsif new.stage_id is distinct from old.stage_id then
    insert into opportunity_stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by) values (new.id, old.stage_id, new.stage_id, auth.uid());
  end if;
  return null;
end $$;
create trigger opportunities_history after insert or update on opportunities for each row execute function opportunity_history();

-- Note, documenti e attività possono ora riferirsi anche a una trattativa.
alter table notes add column opportunity_id uuid references opportunities (id) on delete cascade;
alter table documents add column opportunity_id uuid references opportunities (id) on delete cascade;
alter table activities add column opportunity_id uuid references opportunities (id) on delete cascade;
do $$
declare r record;
begin
  for r in select conrelid::regclass as tbl, conname from pg_constraint
           where contype = 'c' and conrelid in ('notes'::regclass, 'documents'::regclass, 'activities'::regclass)
             and pg_get_constraintdef(oid) like '%num_nonnulls(contact_id, company_id%' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table notes add check (num_nonnulls(contact_id, company_id, opportunity_id) = 1);
alter table documents add check (num_nonnulls(contact_id, company_id, opportunity_id) = 1);
alter table activities add check (num_nonnulls(contact_id, company_id, opportunity_id) >= 1);
create index notes_opp_idx on notes (opportunity_id, created_at desc);
create index documents_opp_idx on documents (opportunity_id);
create index activities_opp_idx on activities (opportunity_id, created_at desc);

-- ---------------------------------------------------------------- attività (task)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to uuid references profiles (id) on delete set null default auth.uid(),
  contact_id uuid references contacts (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  opportunity_id uuid references opportunities (id) on delete cascade,
  done_at timestamptz,
  done_by uuid references profiles (id) on delete set null,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index tasks_open_idx on tasks (assigned_to, due_date) where done_at is null;
create index tasks_opp_idx on tasks (opportunity_id);
create index tasks_contact_idx on tasks (contact_id);

-- ---------------------------------------------------------------- pagamenti (registro, solo aggiunte)
create table payments (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'payment' check (kind in ('payment', 'refund')),
  refund_of uuid references payments (id),
  contact_id uuid references contacts (id) on delete set null,
  company_id uuid references companies (id) on delete set null,
  opportunity_id uuid references opportunities (id) on delete set null,
  booking_id uuid references bookings (id) on delete set null,
  service_id uuid references services (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),         -- sempre positivo, lordo IVA; il segno dipende da `kind`
  vat_rate numeric(4, 1) not null default 22 check (vat_rate between 0 and 100),
  method text not null check (method in ('cash', 'card_pos', 'bank_transfer', 'gift_card', 'stripe', 'other')),
  paid_at timestamptz not null default now(),
  reference text,
  notes text,
  source text not null default 'manual',                          -- 'stripe' in futuro
  external_id text,
  reconciled boolean not null default false,
  recorded_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind = 'refund' or refund_of is null),
  check (kind = 'payment' or refund_of is not null)
);
create unique index payments_external_uq on payments (source, external_id) where external_id is not null;
create index payments_paid_idx on payments (paid_at desc);
create index payments_contact_idx on payments (contact_id);
create index payments_opp_idx on payments (opportunity_id);
create index payments_booking_idx on payments (booking_id);
create trigger payments_audit after insert or update or delete on payments for each row execute function audit_row();

-- Un rimborso non può superare l'importo del pagamento originale (somma dei rimborsi inclusa).
create function payments_check_refund() returns trigger language plpgsql as $$
declare orig payments; already bigint;
begin
  if new.kind = 'refund' and new.refund_of is not null then
    select * into orig from payments where id = new.refund_of;
    if orig.id is null or orig.kind <> 'payment' then raise exception 'Pagamento originale non valido'; end if;
    select coalesce(sum(amount_cents), 0) into already from payments where refund_of = new.refund_of and kind = 'refund';
    if already + new.amount_cents > orig.amount_cents then raise exception 'Il rimborso supera l''importo incassato'; end if;
  end if;
  return new;
end $$;
create trigger payments_refund_guard before insert on payments for each row execute function payments_check_refund();

-- ---------------------------------------------------------------- spese
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  kind text not null default 'fixed' check (kind in ('fixed', 'variable')),   -- costi fissi o variabili/evento
  created_at timestamptz not null default now()
);
create unique index expense_categories_name_uq on expense_categories (lower(name));
insert into expense_categories (name, kind) values
  ('Affitto', 'fixed'), ('Personale', 'fixed'), ('Utenze', 'fixed'), ('Software', 'fixed'), ('Attrezzatura', 'fixed'),
  ('Manutenzione', 'fixed'), ('Pubblicità', 'variable'), ('Catering', 'variable'), ('Eventi', 'variable'),
  ('Fornitori', 'variable'), ('Altro', 'fixed');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  supplier text,
  category_id uuid references expense_categories (id) on delete set null,
  description text,
  net_cents integer not null check (net_cents >= 0),
  vat_cents integer not null default 0 check (vat_cents >= 0),
  total_cents integer generated always as (net_cents + vat_cents) stored,
  payment_status text not null default 'paid' check (payment_status in ('paid', 'unpaid')),
  method text check (method in ('cash', 'card_pos', 'bank_transfer', 'other')),
  opportunity_id uuid references opportunities (id) on delete set null,
  document_url text,
  notes text,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_date_idx on expenses (spent_on desc);
create trigger expenses_audit after insert or update or delete on expenses for each row execute function audit_row();

-- ---------------------------------------------------------------- spesa marketing (inserimento manuale)
create table marketing_spend (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('meta', 'google', 'other')),
  campaign text,
  period_start date not null,
  period_end date not null,
  amount_cents integer not null check (amount_cents >= 0),
  impressions integer check (impressions is null or impressions >= 0),
  clicks integer check (clicks is null or clicks >= 0),
  leads integer check (leads is null or leads >= 0),
  notes text,
  created_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index marketing_spend_idx on marketing_spend (period_start desc);

-- Incassato (al netto IVA e rimborsi) per origine del cliente. Restituisce solo aggregati:
-- il ruolo marketing vede i risultati delle campagne senza accedere ai singoli pagamenti.
create function revenue_by_source(p_from timestamptz, p_to timestamptz)
returns table (source text, customers bigint, collected_net_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role('owner', 'admin', 'marketing') then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;
  return query
    select coalesce(c.source, 'unknown'), count(distinct p.contact_id),
      coalesce(sum(case when p.kind = 'refund' then -1 else 1 end * round(p.amount_cents / (1 + p.vat_rate / 100))), 0)::bigint
    from payments p left join contacts c on c.id = p.contact_id
    where p.paid_at >= p_from and p.paid_at < p_to
    group by 1 order by 3 desc;
end $$;

-- ---------------------------------------------------------------- RLS
alter table pipelines enable row level security;
alter table pipeline_stages enable row level security;
alter table services enable row level security;
alter table opportunities enable row level security;
alter table opportunity_stage_history enable row level security;
alter table tasks enable row level security;
alter table payments enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table marketing_spend enable row level security;

create policy pipelines_read on pipelines for select using (current_app_role() is not null);
create policy pipelines_write on pipelines for update using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));
create policy stages_read on pipeline_stages for select using (current_app_role() is not null);
create policy stages_write on pipeline_stages for all using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));
create policy services_read on services for select using (current_app_role() is not null);
create policy services_write on services for all using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));

create policy opportunities_read on opportunities for select using (current_app_role() is not null);
create policy opportunities_insert on opportunities for insert with check (current_app_role() is not null);
create policy opportunities_update on opportunities for update using (current_app_role() is not null) with check (current_app_role() is not null);
create policy opportunities_delete on opportunities for delete using (has_role('owner', 'admin'));
create policy stage_history_read on opportunity_stage_history for select using (current_app_role() is not null);

create policy tasks_read on tasks for select using (current_app_role() is not null);
create policy tasks_insert on tasks for insert with check (current_app_role() is not null);
create policy tasks_update on tasks for update using (current_app_role() is not null) with check (current_app_role() is not null);
create policy tasks_delete on tasks for delete using (created_by = auth.uid() or has_role('owner', 'admin'));

-- Finanza: solo owner/admin. Il registro pagamenti non ammette cancellazioni (si corregge con un rimborso).
create policy payments_read on payments for select using (has_role('owner', 'admin'));
create policy payments_insert on payments for insert with check (has_role('owner', 'admin') and recorded_by = auth.uid());
create policy payments_update on payments for update using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));
create policy expense_categories_read on expense_categories for select using (current_app_role() is not null);
create policy expense_categories_write on expense_categories for all using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));
create policy expenses_all on expenses for all using (has_role('owner', 'admin')) with check (has_role('owner', 'admin'));
create policy marketing_spend_all on marketing_spend for all using (has_role('owner', 'admin', 'marketing')) with check (has_role('owner', 'admin', 'marketing'));

-- Privilegi espliciti (RLS filtra le righe).
grant select, insert, update, delete on pipelines, pipeline_stages, services, opportunities, tasks,
  expense_categories, expenses, marketing_spend to authenticated;
grant select on opportunity_stage_history to authenticated;
grant select, insert, update on payments to authenticated;
grant execute on function revenue_by_source(timestamptz, timestamptz) to authenticated;
revoke execute on function opportunity_history() from public, authenticated;
