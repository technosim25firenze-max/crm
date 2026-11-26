-- Ultimo contatto (touchpoint): aggiornato a ogni nota su una trattativa o un contatto. Serve a colorare le schede ferme.
alter table opportunities add column last_contact_at timestamptz not null default now();
alter table contacts add column last_contact_at timestamptz not null default now();
update opportunities o set last_contact_at = coalesce((select max(n.created_at) from notes n where n.opportunity_id = o.id), o.created_at);
update contacts c set last_contact_at = coalesce((select max(n.created_at) from notes n where n.contact_id = c.id), c.created_at);

create function notes_touch_last_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.opportunity_id is not null then
    update opportunities set last_contact_at = greatest(last_contact_at, new.created_at) where id = new.opportunity_id;
    update contacts set last_contact_at = greatest(last_contact_at, new.created_at)
      where id = (select contact_id from opportunities where id = new.opportunity_id);
  end if;
  if new.contact_id is not null then
    update contacts set last_contact_at = greatest(last_contact_at, new.created_at) where id = new.contact_id;
  end if;
  return new;
end $$;
create trigger notes_touch_last_contact after insert on notes for each row execute function notes_touch_last_contact();

-- Origini: aggiunte ricerca, referenza attribuibile a Meta, passaparola. "referral" diventa "Referenza normale";
-- i contatti che prima erano "Passaparola" (referral) passano al nuovo valore word_of_mouth.
update contacts set source = 'word_of_mouth' where source = 'referral';
update contacts set source = 'partnership' where source = 'partner';
alter table contacts drop constraint if exists contacts_source_check;
alter table contacts add constraint contacts_source_check check (source in (
  'website_form', 'landing_page', 'meta_lead_ads', 'meta_ads', 'google_ads', 'google_organic', 'direct',
  'instagram_organic', 'facebook_organic', 'referral', 'walk_in', 'phone', 'partner', 'other', 'unknown',
  'search', 'referral_meta', 'word_of_mouth', 'partnership'));
