-- DATI DI DEMO — persone e aziende fittizie, solo per sviluppo locale. Non eseguire in produzione.
insert into tags (name, color) values ('Demo', '#d7d8dd'), ('VIP', '#e01f25'), ('Evento aziendale', '#3f843e');

insert into companies (name, industry, city, source) values
  ('Esempio Meccanica S.r.l.', 'Manifattura', 'Firenze', 'manual'),
  ('Demo Software S.p.A.', 'Software', 'Prato', 'manual');

insert into contacts (first_name, last_name, email, phone, kind, lifecycle, source, attribution_status, city) values
  ('Mario', 'Rossi', 'mario.rossi@example.com', '+39 333 1234567', 'b2c', 'active', 'walk_in', 'independent', 'Firenze'),
  ('Giulia', 'Bianchi', 'giulia.bianchi@example.com', '347 7654321', 'b2b', 'prospect', 'website_form', 'unknown', 'Prato'),
  ('Luca', 'Verdi', null, '0039 055 123456', 'b2c', 'returning', 'unknown', 'pre_crm', 'Pistoia');

insert into company_contacts (company_id, contact_id, role, is_primary)
  select co.id, c.id, 'Responsabile eventi', true
  from companies co, contacts c where co.name like 'Demo Software%' and c.email = 'giulia.bianchi@example.com';
