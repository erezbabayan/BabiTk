-- Supabase Storage bucket for source materials (audio, notebook images)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-materials',
  'source-materials',
  false,
  10485760,
  array['audio/ogg', 'audio/mpeg', 'audio/mp4', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Users can read own source files"
  on storage.objects for select
  using (
    bucket_id = 'source-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Service role manages source files"
  on storage.objects for all
  using (bucket_id = 'source-materials')
  with check (bucket_id = 'source-materials');
