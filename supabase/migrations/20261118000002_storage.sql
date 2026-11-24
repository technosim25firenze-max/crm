-- Bucket privato per i documenti. L'accesso avviene solo con URL firmati a scadenza.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy documents_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.current_app_role() is not null);
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.current_app_role() is not null);
create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.has_role('owner', 'admin'));
