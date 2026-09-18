-- Browser recordings must be uploadable as wav/webm, and the user client
-- needs insert/update on their own folder for repair fallbacks.
update storage.buckets
set allowed_mime_types = array[
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/3gpp',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'source-materials';

drop policy if exists "Users can upload own source files" on storage.objects;
create policy "Users can upload own source files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'source-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own source files" on storage.objects;
create policy "Users can update own source files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'source-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'source-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
