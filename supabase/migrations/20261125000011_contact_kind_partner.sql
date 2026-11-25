-- Tipo contatto: reintroduce "partner" (collaborazioni, non clienti né fornitori).
alter table contacts drop constraint if exists contacts_kind_check;
alter table contacts add constraint contacts_kind_check check (kind in ('b2c', 'b2b', 'partner', 'supplier'));
