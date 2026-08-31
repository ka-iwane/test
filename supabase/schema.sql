create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  team_name text check (team_name is null or char_length(team_name) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.team_access (
  id uuid primary key default gen_random_uuid(),
  team_name text not null check (char_length(team_name) between 1 and 80),
  token_hash bytea not null unique,
  pin_hash text not null,
  expires_at timestamptz not null,
  max_registrations integer not null check (max_registrations > 0),
  registration_count integer not null default 0 check (registration_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.team_claim_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 3 and 500),
  original_name text not null check (char_length(original_name) between 1 and 255),
  caption text check (caption is null or char_length(caption) <= 160),
  location text check (location is null or char_length(location) <= 80),
  taken_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photos add column if not exists thumbnail_path text;
alter table public.photos add column if not exists deleted_at timestamptz;
alter table public.photos add column if not exists team_name text;

create index if not exists photos_created_at_idx on public.photos (created_at desc);
create index if not exists photos_user_id_idx on public.photos (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

create or replace function public.set_photo_team()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select participants.team_name
  into new.team_name
  from public.participants
  where participants.user_id = new.user_id
    and participants.is_active;

  if new.team_name is null then
    raise exception '有効なチーム参加登録が必要です。';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_set_team on public.photos;
create trigger photos_set_team
before insert on public.photos
for each row execute function public.set_photo_team();

create or replace function public.create_team_access(
  p_team_name text,
  p_pin text,
  p_expires_at timestamptz,
  p_max_registrations integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if char_length(trim(p_team_name)) not between 1 and 80
    or p_pin !~ '^[0-9]{4,8}$'
    or p_expires_at <= now()
    or p_max_registrations <= 0 then
    raise exception 'チーム名、PIN、有効期限、登録上限を確認してください。';
  end if;

  insert into public.team_access (
    team_name,
    token_hash,
    pin_hash,
    expires_at,
    max_registrations
  ) values (
    trim(p_team_name),
    extensions.digest(v_token, 'sha256'),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    p_expires_at,
    p_max_registrations
  );

  return v_token;
end;
$$;

drop function if exists public.claim_team_access(text, text, text);
create function public.claim_team_access(
  p_team_token text,
  p_pin text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.team_access%rowtype;
  v_user_id uuid := auth.uid();
  v_attempt_count integer;
begin
  if v_user_id is null then
    return 'unauthorized';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 80 then
    return 'invalid_display_name';
  end if;
  if exists (select 1 from public.participants where user_id = v_user_id) then
    return 'already_registered';
  end if;

  insert into public.team_claim_attempts (user_id, attempt_count, window_started_at)
  values (v_user_id, 1, now())
  on conflict (user_id) do update set
    attempt_count = case
      when team_claim_attempts.window_started_at < now() - interval '10 minutes' then 1
      else team_claim_attempts.attempt_count + 1
    end,
    window_started_at = case
      when team_claim_attempts.window_started_at < now() - interval '10 minutes' then now()
      else team_claim_attempts.window_started_at
    end
  returning attempt_count into v_attempt_count;

  if v_attempt_count > 5 then
    return 'rate_limited';
  end if;
  if p_team_token is null or p_team_token !~ '^[0-9a-f]{48}$' then
    return 'invalid';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    return 'invalid';
  end if;

  select *
  into v_access
  from public.team_access
  where token_hash = extensions.digest(p_team_token, 'sha256')
    and is_active
    and expires_at > now()
    and registration_count < max_registrations
  for update;

  if not found then
    return 'invalid';
  end if;
  if v_access.pin_hash <> extensions.crypt(p_pin, v_access.pin_hash) then
    return 'invalid';
  end if;

  insert into public.participants (user_id, display_name, team_name)
  values (v_user_id, trim(p_display_name), v_access.team_name);

  update public.team_access
  set registration_count = registration_count + 1
  where id = v_access.id;

  delete from public.team_claim_attempts where user_id = v_user_id;
  return 'ok';
end;
$$;

revoke all on function public.create_team_access(text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_team_access(text, text, text) from public, anon;
grant execute on function public.claim_team_access(text, text, text) to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_create_team_access(
  p_team_name text,
  p_pin text,
  p_expires_at timestamptz,
  p_max_registrations integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者権限が必要です。';
  end if;
  return public.create_team_access(p_team_name, p_pin, p_expires_at, p_max_registrations);
end;
$$;

create or replace function public.admin_list_team_access()
returns table (
  id uuid,
  team_name text,
  expires_at timestamptz,
  max_registrations integer,
  registration_count integer,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者権限が必要です。';
  end if;
  return query
  select access.id, access.team_name, access.expires_at,
    access.max_registrations, access.registration_count,
    access.is_active, access.created_at
  from public.team_access access
  order by access.created_at desc;
end;
$$;

create or replace function public.admin_set_team_access_active(
  p_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者権限が必要です。';
  end if;
  update public.team_access set is_active = p_is_active where id = p_id;
end;
$$;

create or replace function public.admin_list_participants()
returns table (
  user_id uuid,
  display_name text,
  team_name text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者権限が必要です。';
  end if;
  return query
  select participant.user_id, participant.display_name,
    participant.team_name, participant.is_active, participant.created_at
  from public.participants participant
  order by participant.team_name, participant.created_at;
end;
$$;

create or replace function public.admin_set_participant_active(
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '管理者権限が必要です。';
  end if;
  update public.participants
  set is_active = p_is_active
  where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_create_team_access(text, text, timestamptz, integer) from public, anon;
revoke all on function public.admin_list_team_access() from public, anon;
revoke all on function public.admin_set_team_access_active(uuid, boolean) from public, anon;
revoke all on function public.admin_list_participants() from public, anon;
revoke all on function public.admin_set_participant_active(uuid, boolean) from public, anon;
grant execute on function public.admin_create_team_access(text, text, timestamptz, integer) to authenticated;
grant execute on function public.admin_list_team_access() to authenticated;
grant execute on function public.admin_set_team_access_active(uuid, boolean) to authenticated;
grant execute on function public.admin_list_participants() to authenticated;
grant execute on function public.admin_set_participant_active(uuid, boolean) to authenticated;

create or replace function public.is_same_team_participant(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants current_participant
    join public.participants target_participant
      on target_participant.user_id::text = p_user_id
    where current_participant.user_id = auth.uid()
      and current_participant.is_active
      and current_participant.team_name = target_participant.team_name
  );
$$;

revoke all on function public.is_same_team_participant(text) from public, anon;
grant execute on function public.is_same_team_participant(text) to authenticated;

alter table public.photos enable row level security;
alter table public.admins enable row level security;
alter table public.participants enable row level security;
alter table public.team_access enable row level security;
alter table public.team_claim_attempts enable row level security;

drop policy if exists "Admins can read their own profile" on public.admins;
create policy "Admins can read their own profile"
on public.admins for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Participants can read their own profile" on public.participants;
create policy "Participants can read their own profile"
on public.participants for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Photos are publicly readable" on public.photos;
drop policy if exists "Active participants can read photos" on public.photos;
create policy "Active participants can read photos"
on public.photos for select
to authenticated
using (
  exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
  )
  and (deleted_at is null or user_id = (select auth.uid()))
);

drop policy if exists "Users can insert their own photos" on public.photos;
create policy "Users can insert their own photos"
on public.photos for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
      and participants.team_name = photos.team_name
  )
);

drop policy if exists "Users can update their own photos" on public.photos;
create policy "Users can update their own photos"
on public.photos for update
to authenticated
using (
  exists (
    select 1
    from public.participants current_participant
    where current_participant.user_id = (select auth.uid())
      and current_participant.is_active
      and current_participant.team_name = photos.team_name
  )
)
with check (
  exists (
    select 1
    from public.participants current_participant
    where current_participant.user_id = (select auth.uid())
      and current_participant.is_active
      and current_participant.team_name = photos.team_name
  )
);

drop policy if exists "Users can delete their own photos" on public.photos;
create policy "Users can delete their own photos"
on public.photos for delete
to authenticated
using (
  exists (
    select 1
    from public.participants current_participant
    where current_participant.user_id = (select auth.uid())
      and current_participant.is_active
      and current_participant.team_name = photos.team_name
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
  )
);

drop policy if exists "Participants can view photos" on storage.objects;
create policy "Participants can view photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'photos'
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
  )
);

drop policy if exists "Users can delete from their own folder" on storage.objects;
create policy "Users can delete from their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'photos'
  and public.is_same_team_participant(owner_id)
);

drop policy if exists "Admins can read all photos" on public.photos;
create policy "Admins can read all photos"
on public.photos for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update all photos" on public.photos;
create policy "Admins can update all photos"
on public.photos for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete all photos" on public.photos;
create policy "Admins can delete all photos"
on public.photos for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins can view all photo objects" on storage.objects;
create policy "Admins can view all photo objects"
on storage.objects for select
to authenticated
using (bucket_id = 'photos' and public.is_admin());

drop policy if exists "Admins can delete all photo objects" on storage.objects;
create policy "Admins can delete all photo objects"
on storage.objects for delete
to authenticated
using (bucket_id = 'photos' and public.is_admin());