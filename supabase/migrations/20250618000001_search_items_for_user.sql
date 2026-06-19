-- Semantic search across all item types (tasks + notes), optionally scoped by board

create or replace function public.search_items_for_user(
  p_user_id uuid,
  query_embedding vector(1536),
  match_count integer default 10,
  match_threshold float default 0.45,
  p_scope text default 'all'
)
returns table (
  id uuid,
  title text,
  content text,
  tags text[],
  is_actionable boolean,
  status text,
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
    i.is_actionable,
    i.status::text,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.mindtasker_items i
  where i.user_id = p_user_id
    and i.deleted_at is null
    and i.embedding is not null
    and 1 - (i.embedding <=> query_embedding) > match_threshold
    and (
      p_scope = 'all'
      or (p_scope = 'inbox' and i.status = 'inbox')
      or (p_scope = 'today' and i.is_actionable = true and i.status = 'pending')
      or (p_scope = 'notes' and i.is_actionable = false and i.status = 'pending')
    )
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.search_items_for_user is
  'Semantic search by user id and board scope — used by MindTasker backend';

grant execute on function public.search_items_for_user(uuid, vector, integer, double precision, text)
  to service_role;
