-- BabiSnap settings can read and rotate only the signed-in user's BabiSnap token.
-- token_hash is not selectable. Other device names, including Raspberry Pi, cannot be
-- inserted or revoked through these grants. Apply this file manually with the
-- Management API; do not assume db push.

grant select (id, user_id, name, created_at, last_used_at, revoked_at)
  on table public.device_tokens to authenticated;

grant insert (user_id, name, token_hash)
  on table public.device_tokens to authenticated;

grant update (revoked_at)
  on table public.device_tokens to authenticated;

create policy device_tokens_select_own
  on public.device_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

create policy device_tokens_insert_babisnap
  on public.device_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid() and name = 'BabiSnap');

create policy device_tokens_revoke_babisnap
  on public.device_tokens
  for update
  to authenticated
  using (user_id = auth.uid() and name = 'BabiSnap' and revoked_at is null)
  with check (user_id = auth.uid() and name = 'BabiSnap');

create or replace function public.babisnap_status()
returns table (connected boolean, last_used_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select
    exists (
      select 1
      from public.device_tokens
      where user_id = auth.uid()
        and name = 'BabiSnap'
        and revoked_at is null
    ) as connected,
    (
      select max(t.last_used_at)
      from public.device_tokens as t
      where t.user_id = auth.uid()
        and t.name = 'BabiSnap'
        and t.revoked_at is null
    ) as last_used_at;
$$;

create or replace function public.babisnap_connect(p_token_hash text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  update public.device_tokens
    set revoked_at = now()
    where user_id = auth.uid()
      and name = 'BabiSnap'
      and revoked_at is null;

  insert into public.device_tokens (user_id, name, token_hash)
  values (auth.uid(), 'BabiSnap', p_token_hash);
end;
$$;

create or replace function public.babisnap_disconnect()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.device_tokens
    set revoked_at = now()
    where user_id = auth.uid()
      and name = 'BabiSnap'
      and revoked_at is null;
end;
$$;

revoke all on function public.babisnap_status() from public, anon;
revoke all on function public.babisnap_connect(text) from public, anon;
revoke all on function public.babisnap_disconnect() from public, anon;
grant execute on function public.babisnap_status() to authenticated;
grant execute on function public.babisnap_connect(text) to authenticated;
grant execute on function public.babisnap_disconnect() to authenticated;

comment on function public.babisnap_connect(text) is
  'Replace the caller BabiSnap token hash. Does not revoke other device names.';
