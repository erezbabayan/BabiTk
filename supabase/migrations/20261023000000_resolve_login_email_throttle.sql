-- Username login: limit enumeration of resolve_login_email.
-- * Email input no longer echoes whether the address exists (clients never send emails here).
-- * Per-IP (30 / 10 min) and per-network (/24 or /48: 120 / 10 min) throttle; over the limit returns
--   null, which clients show as the same generic "wrong username or password" message.
--   No per-username bucket on purpose: it would let anyone lock a real user out of username login.
create table if not exists public.login_lookup_throttle (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.login_lookup_throttle enable row level security;
revoke all on public.login_lookup_throttle from anon, authenticated;

create or replace function public.login_lookup_hit(p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_hits integer;
begin
  insert into public.login_lookup_throttle as t (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case when t.window_start < now() - interval '10 minutes' then 1 else t.hits + 1 end,
        window_start = case when t.window_start < now() - interval '10 minutes' then now() else t.window_start end
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;

revoke all on function public.login_lookup_hit(text, integer) from public, anon, authenticated;

create or replace function public.resolve_login_email(identifier text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  trimmed text := lower(trim(identifier));
  found_email text;
  headers json;
  client_ip text;
  client_net text;
  allowed boolean := true;
begin
  if trimmed is null or trimmed = '' or position('@' in trimmed) > 0 then
    return null;
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  client_ip := nullif(trim(split_part(coalesce(headers->>'x-forwarded-for', headers->>'cf-connecting-ip', ''), ',', 1)), '');

  if client_ip is not null then
    if position(':' in client_ip) > 0 then
      client_net := array_to_string((string_to_array(client_ip, ':'))[1:3], ':');
    else
      client_net := regexp_replace(client_ip, '\.[0-9]+$', '');
    end if;
    allowed := public.login_lookup_hit('ip:' || client_ip, 30);
    allowed := public.login_lookup_hit('net:' || client_net, 120) and allowed;
  end if;

  if random() < 0.02 then
    delete from public.login_lookup_throttle where window_start < now() - interval '1 day';
  end if;

  if not allowed then
    return null;
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
