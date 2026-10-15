-- New Google/password users must get a public.users row immediately so
-- Settings, onboarding, notifications, and calendar connect work without
-- a developer setup step. Allow a signed-in user to insert their own
-- free-tier profile if the auth trigger has not landed yet.

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
  on public.users
  for insert
  with check (
    auth.uid() = id
    and tier = 'free'::public.user_tier
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text;
  assigned_tier public.user_tier;
begin
  meta_username := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  assigned_tier := case
    when lower(coalesce(new.email, '')) = 'erezbabayan@gmail.com' then 'premium'::public.user_tier
    when lower(coalesce(meta_username, '')) in ('erezbababan', 'erezbabayan') then 'premium'::public.user_tier
    else 'free'::public.user_tier
  end;

  insert into public.users (id, email, username, tier)
  values (new.id, new.email, meta_username, assigned_tier)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.users.email),
        username = coalesce(public.users.username, excluded.username),
        tier = case
          when excluded.tier = 'premium' then 'premium'::public.user_tier
          else public.users.tier
        end;
  return new;
end;
$$;
