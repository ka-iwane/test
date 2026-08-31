create extension if not exists pgcrypto;

create table if not exists public.participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  team_name text check (team_name is null or char_length(team_name) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
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

alter table public.photos enable row level security;
alter table public.participants enable row level security;

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
  )
);

drop policy if exists "Users can update their own photos" on public.photos;
create policy "Users can update their own photos"
on public.photos for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
  )
);

drop policy if exists "Users can delete their own photos" on public.photos;
create policy "Users can delete their own photos"
on public.photos for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
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
  and owner_id = (select auth.uid()::text)
  and exists (
    select 1 from public.participants
    where participants.user_id = (select auth.uid())
      and participants.is_active
  )
);