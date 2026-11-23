-- Fotos públicas del catálogo; solo administradores de Avena Cubana Pop pueden modificarlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avena-cubana-catalog-images', 'avena-cubana-catalog-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Avena Cubana Pop admins upload catalog images" on storage.objects;
create policy "Avena Cubana Pop admins upload catalog images" on storage.objects
for insert to authenticated with check (bucket_id = 'avena-cubana-catalog-images' and public.is_la_tuba_admin());
drop policy if exists "Avena Cubana Pop admins remove catalog images" on storage.objects;
create policy "Avena Cubana Pop admins remove catalog images" on storage.objects
for delete to authenticated using (bucket_id = 'avena-cubana-catalog-images' and public.is_la_tuba_admin());
