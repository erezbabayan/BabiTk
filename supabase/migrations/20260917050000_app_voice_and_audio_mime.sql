-- In-app microphone recordings (web/mobile) as a first-class source channel.
alter type public.source_type add value if not exists 'app_voice';

-- Browsers record webm/ogg/wav; Expo records m4a/aac.
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
