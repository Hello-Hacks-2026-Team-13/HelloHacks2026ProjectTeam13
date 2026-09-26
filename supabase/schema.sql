-- Run once in your Supabase SQL editor. The API is the only database writer.
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  version integer not null default 0,
  invite_hash text unique,
  invite_expires timestamptz
);
create table public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade
);
create index memberships_room_idx on public.memberships(room_id);
create table public.calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted text not null
);
create table public.oauth_states (
  digest text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.rooms enable row level security;
alter table public.memberships enable row level security;
alter table public.calendar_tokens enable row level security;
alter table public.oauth_states enable row level security;
-- No browser policies: authenticated requests go through Express, which verifies
-- the bearer token and derives the actor from Supabase Auth (never request data).
revoke all on public.rooms, public.memberships, public.calendar_tokens, public.oauth_states from anon, authenticated;
grant all on public.rooms, public.memberships, public.calendar_tokens, public.oauth_states to service_role;

create function public.create_pair(actor uuid, profile jsonb, invite_digest text)
returns void language plpgsql set search_path = public as $$
declare room_id uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if exists(select 1 from memberships where user_id = actor) then raise exception 'You already have a space.'; end if;
  insert into rooms(id,data,invite_hash,invite_expires) values(room_id,
    jsonb_build_object('id',room_id,'profiles',jsonb_build_array(profile || jsonb_build_object('id',actor)), 'offers','[]'::jsonb,'plans','[]'::jsonb,'createdAt',now()), invite_digest,now()+interval '1 day');
  insert into memberships values(actor,room_id);
end; $$;
create function public.join_pair(actor uuid, profile jsonb, invite_digest text)
returns void language plpgsql set search_path = public as $$
declare target rooms%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if exists(select 1 from memberships where user_id = actor) then raise exception 'You already have a space.'; end if;
  select * into target from rooms where invite_hash = invite_digest and invite_expires > now() for update;
  if not found or jsonb_array_length(target.data->'profiles') <> 1 then raise exception 'That invite is invalid, expired, or already used.'; end if;
  insert into memberships values(actor,target.id);
  update rooms set data = jsonb_set(data,'{profiles}',(data->'profiles') || jsonb_build_array(profile || jsonb_build_object('id',actor))),
    version = version+1, invite_hash = null, invite_expires = null where id = target.id;
end; $$;
revoke all on function public.create_pair(uuid,jsonb,text), public.join_pair(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_pair(uuid,jsonb,text), public.join_pair(uuid,jsonb,text) to service_role;
