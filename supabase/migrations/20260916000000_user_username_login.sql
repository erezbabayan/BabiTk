-- Per-user login: unique username plus anonymous lookup for sign-in
alter table public.users
  add column if not exists username text;

comment on column public.users.username is 'Public login name (unique, case-insensitive)';

create unique index if not exists users_username_lower_idx
  on public.users (lower(username))
  where username is not null;

alter table public.users
  drop constraint if exists users_username_format;

alter table public.users
  add constraint users_username_format check (
    username is null
    or (
      char_length(trim(username)) between 2 and 32
      and username !~ '[[:space:]]'
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text;
begin
  meta_username := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  insert into public.users (id, email, username)
  values (new.id, new.email, meta_username)
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.users.username, excluded.username);
  return new;
end;
$$;

create or replace function public.resolve_login_email(identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  trimmed text := lower(trim(identifier));
  found_email text;
begin
  if trimmed is null or trimmed = '' then
    return null;
  end if;

  if position('@' in trimmed) > 0 then
    select u.email into found_email
    from public.users u
    where lower(u.email) = trimmed
    limit 1;
    return found_email;
  end if;

  select u.email into found_email
  from public.users u
  where lower(u.username) = trimmed
  limit 1;
  return found_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
