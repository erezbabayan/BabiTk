-- Backend-safe semantic search (service role passes explicit user id)

create or replace function public.search_notes_for_user(
  p_user_id uuid,
  query_embedding vector(1536),
  match_count integer default 10,
  match_threshold float default 0.45
)
returns table (
  id uuid,
  title text,
  content text,
  tags text[],
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.title,
    i.content,
    i.tags,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.mindtasker_items i
  where i.user_id = p_user_id
    and i.is_actionable = false
    and i.deleted_at is null
    and i.embedding is not null
    and 1 - (i.embedding <=> query_embedding) > match_threshold
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.search_notes_for_user is
  'Semantic note search by user id — used by MindTasker backend with service role';

grant execute on function public.search_notes_for_user(uuid, vector, integer, double precision)
  to service_role;
