-- Additional source channels for icons and ingest routing
alter type public.source_type add value if not exists 'typed_text';
alter type public.source_type add value if not exists 'image';
alter type public.source_type add value if not exists 'document';
