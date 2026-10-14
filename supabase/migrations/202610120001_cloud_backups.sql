begin;
create table public.cloud_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  source_platform text not null check (source_platform in ('desktop', 'web')),
  byte_size integer not null check (byte_size between 1 and 20971520),
  payload jsonb not null
);
create index cloud_backups_owner_date on public.cloud_backups(user_id, created_at desc, id);
alter table public.cloud_backups enable row level security;
create policy cloud_backups_owner_read on public.cloud_backups for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.cloud_backups from anon, authenticated;
grant select on public.cloud_backups to authenticated;

create function public.cloud_backup_save(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); new_id uuid; payload_bytes integer;
begin
  if owner is null or not exists (select 1 from auth.users where id = owner and email_confirmed_at is not null) then
    raise exception 'Sign in with a verified email to save backups' using errcode = '42501';
  end if;
  payload_bytes := octet_length(convert_to(p_payload::text, 'UTF8'));
  if p_payload is null or payload_bytes > 20971520 or p_payload->>'app' is distinct from 'Ginomai'
    or p_payload->>'type' is distinct from 'cloud_backup' or p_payload->>'formatVersion' is distinct from '1'
    or p_payload->>'sourcePlatform' not in ('desktop', 'web') or p_payload->>'sourcePlatform' is null
    or jsonb_typeof(p_payload->'songs') is distinct from 'array' or jsonb_typeof(p_payload->'sessions') is distinct from 'array' then
    raise exception 'Invalid cloud backup or backup exceeds 20 MiB';
  end if;
  -- Serialize successful saves per owner; insertion and retention commit together.
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  insert into public.cloud_backups(user_id, source_platform, byte_size, payload)
    values(owner, p_payload->>'sourcePlatform', payload_bytes, p_payload) returning id into new_id;
  delete from public.cloud_backups where user_id = owner and id not in (
    select id from public.cloud_backups where user_id = owner order by created_at desc, id desc limit 5
  );
  return new_id;
end;
$$;
create function public.cloud_backup_list() returns table(id uuid, created_at timestamptz, source_platform text, byte_size integer)
language sql security invoker set search_path = '' as $$
  select id, created_at, source_platform, byte_size from public.cloud_backups where user_id = auth.uid() order by created_at desc, id desc;
$$;
create function public.cloud_backup_get(p_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select payload from public.cloud_backups where id = p_id and user_id = auth.uid();
$$;
create function public.cloud_backup_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.cloud_backups where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Backup not found for this account' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.cloud_backup_save(jsonb), public.cloud_backup_list(), public.cloud_backup_get(uuid), public.cloud_backup_delete(uuid) from public, anon;
grant execute on function public.cloud_backup_save(jsonb), public.cloud_backup_list(), public.cloud_backup_get(uuid), public.cloud_backup_delete(uuid) to authenticated;
commit;
