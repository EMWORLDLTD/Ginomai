begin;
create schema if not exists ginomai_private;
revoke all on schema ginomai_private from public, anon, authenticated;
create table ginomai_private.administrators(user_id uuid primary key references auth.users(id) on delete cascade);
create table ginomai_private.installation_activity (
  installation_id uuid not null, activity_day date not null,
  platform text not null check (platform in ('desktop','web')),
  app_version text not null check (length(app_version) between 1 and 64),
  primary key(installation_id, activity_day)
);
create table ginomai_private.account_activity (
  user_id uuid not null references auth.users(id) on delete cascade, activity_day date not null,
  primary key(user_id, activity_day)
);
create index installation_activity_day on ginomai_private.installation_activity(activity_day);
create index account_activity_day on ginomai_private.account_activity(activity_day);
alter table ginomai_private.administrators enable row level security;
alter table ginomai_private.installation_activity enable row level security;
alter table ginomai_private.account_activity enable row level security;
revoke all on all tables in schema ginomai_private from public, anon, authenticated;

create function public.record_cloud_activity(p_installation_id uuid, p_platform text, p_app_version text, p_consent boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'UTC')::date; owner uuid := auth.uid();
begin
  if p_consent is distinct from true then return; end if;
  if p_installation_id is null or p_platform is null or p_platform not in ('desktop','web') or p_app_version is null or length(p_app_version) not between 1 and 64 then
    raise exception 'Invalid activity record';
  end if;
  insert into ginomai_private.installation_activity(installation_id,activity_day,platform,app_version)
    values(p_installation_id,today,p_platform,p_app_version) on conflict(installation_id,activity_day) do nothing;
  if owner is not null and exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then
    insert into ginomai_private.account_activity(user_id,activity_day) values(owner,today) on conflict(user_id,activity_day) do nothing;
  end if;
end;
$$;
create function public.cloud_admin_report() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'UTC')::date;
begin
  if auth.uid() is null or not exists(select 1 from ginomai_private.administrators where user_id=auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object('generated_at',now(),
    'verified_accounts',(select count(*) from auth.users where email_confirmed_at is not null),
    'daily_accounts',(select count(*) from ginomai_private.account_activity where activity_day=today),
    'monthly_accounts',(select count(distinct user_id) from ginomai_private.account_activity where activity_day between today-29 and today),
    'daily_installations',(select count(*) from ginomai_private.installation_activity where activity_day=today),
    'monthly_installations',(select count(distinct installation_id) from ginomai_private.installation_activity where activity_day between today-29 and today));
end;
$$;
revoke all on function public.record_cloud_activity(uuid,text,text,boolean), public.cloud_admin_report() from public;
grant execute on function public.record_cloud_activity(uuid,text,text,boolean) to anon, authenticated;
revoke all on function public.cloud_admin_report() from anon;
grant execute on function public.cloud_admin_report() to authenticated;
commit;
