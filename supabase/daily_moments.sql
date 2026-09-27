-- Run after schema.sql. Moment metadata uses the existing private rooms JSONB.
-- Photos are accessed through Express only; do NOT add client storage policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('daily-moments', 'daily-moments', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive policies also protect this bucket if this project has permissive
-- policies for other buckets. The backend service role bypasses RLS.
drop policy if exists "daily moments server only" on storage.objects;
create policy "daily moments server only" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'daily-moments')
with check (bucket_id <> 'daily-moments');
