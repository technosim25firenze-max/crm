-- Origine: un solo elenco per contatti e trattative. I valori doppi o storici vengono ricondotti a quelli in elenco
-- ("Meta Lead Ads" confluisce in "Meta Ads"). Il trigger vale anche per webhook e funzioni che scrivono i vecchi valori.
create function normalize_source(s text) returns text language sql immutable as $$
  select case
    when s = 'meta_lead_ads' then 'meta_ads'
    when s = 'landing_page' then 'website_form'
    when s = 'partner' then 'partnership'
    when s in ('walk_in', 'phone') then 'other'
    when s in ('unknown', 'website_form', 'search', 'meta_ads', 'google_ads', 'google_organic', 'instagram_organic',
               'facebook_organic', 'direct', 'referral_meta', 'referral', 'word_of_mouth', 'partnership', 'other') then s
    else 'unknown'
  end
$$;

create function apply_normalized_source() returns trigger language plpgsql as $$
begin
  new.source := normalize_source(new.source);
  return new;
end $$;

-- Solo la colonna origine: gli altri trigger (cronologia, "aggiornato il") non devono scattare per questa pulizia.
alter table contacts disable trigger user;
update contacts set source = normalize_source(source) where source is distinct from normalize_source(source);
alter table contacts enable trigger user;
alter table opportunities disable trigger user;
update opportunities set source = normalize_source(source) where source is distinct from normalize_source(source);
alter table opportunities enable trigger user;

alter table opportunities alter column source set default 'unknown';
create trigger contacts_normalize_source before insert or update of source on contacts for each row execute function apply_normalized_source();
create trigger opportunities_normalize_source before insert or update of source on opportunities for each row execute function apply_normalized_source();
