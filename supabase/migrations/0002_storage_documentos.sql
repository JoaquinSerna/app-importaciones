-- =====================================================================
-- 0002_storage_documentos.sql
-- Bucket de Storage para documentos (liquidaciones de despachante, etc.)
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "documentos_select_autenticados" on storage.objects
  for select using (bucket_id = 'documentos' and auth.role() = 'authenticated');

create policy "documentos_insert_admin_operador" on storage.objects
  for insert with check (
    bucket_id = 'documentos' and public.current_user_rol() in ('admin', 'operador')
  );

create policy "documentos_delete_admin" on storage.objects
  for delete using (bucket_id = 'documentos' and public.current_user_rol() = 'admin');
