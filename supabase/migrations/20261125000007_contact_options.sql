-- Opzioni contatto: via "partner" dai tipi, VIP diventa un tag, origini "manual"/"import" sostituite da "other".
insert into tags (name, color) values ('VIP', '#e01f25') on conflict do nothing;
insert into contact_tags (contact_id, tag_id)
  select c.id, (select id from tags where lower(name) = 'vip') from contacts c where c.lifecycle = 'vip'
  on conflict do nothing;

update contacts set lifecycle = 'active' where lifecycle = 'vip';
update contacts set kind = 'b2b' where kind = 'partner';
update contacts set source = 'unknown' where source in ('manual', 'import');

alter table contacts drop constraint if exists contacts_kind_check;
alter table contacts drop constraint if exists contacts_lifecycle_check;
alter table contacts drop constraint if exists contacts_source_check;
alter table contacts add constraint contacts_kind_check check (kind in ('b2c', 'b2b', 'supplier'));
alter table contacts add constraint contacts_lifecycle_check check (lifecycle in ('prospect', 'active', 'returning', 'inactive'));
alter table contacts add constraint contacts_source_check check (source in (
  'website_form', 'landing_page', 'meta_lead_ads', 'meta_ads', 'google_ads', 'google_organic', 'direct',
  'instagram_organic', 'facebook_organic', 'referral', 'walk_in', 'phone', 'partner', 'other', 'unknown'));
