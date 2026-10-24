-- ROLLBACK for 20261024180000 (do not run unless needed)
CREATE OR REPLACE FUNCTION public.search_items_for_user(p_user_id uuid, query_embedding vector, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.45, p_scope text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, title text, content text, tags text[], is_actionable boolean, status text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.search_notes_for_user(p_user_id uuid, query_embedding vector, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.45)
 RETURNS TABLE(id uuid, title text, content text, tags text[], similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

grant execute on function public.search_items_for_user(uuid, vector, integer, double precision, text) to public, anon;
grant execute on function public.search_notes_for_user(uuid, vector, integer, double precision) to public, anon;
grant execute on function public.handle_new_user() to public, anon;
grant execute on function public.guard_phone_verification() to public, anon;
