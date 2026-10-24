-- Run manually AFTER deploying the voice-ingest tags change (Management API / SQL editor).
-- Idempotent: inserts tag 'מילואים' for erezbabayan@gmail.com only if missing.
-- Safe to re-run; never changes an existing tag's color or order.
insert into public.user_tags (user_id, name, color, sort_order)
select u.id, 'מילואים', '#fca5a5',
       coalesce((select max(t.sort_order) + 1 from public.user_tags t where t.user_id = u.id), 0)
from public.users u
where lower(u.email) = 'erezbabayan@gmail.com'
on conflict (user_id, name) do nothing
returning id, name;
