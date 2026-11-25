-- Kanban dei lead: fase commerciale del contatto (null = non è un lead e non compare nella bacheca).
alter table contacts add column lead_stage text
  check (lead_stage in ('to_contact', 'called', 'message_sent', 'visit_booked', 'quote_sent', 'follow_up', 'closed', 'lost'));
create index contacts_lead_stage_idx on contacts (lead_stage) where lead_stage is not null;
