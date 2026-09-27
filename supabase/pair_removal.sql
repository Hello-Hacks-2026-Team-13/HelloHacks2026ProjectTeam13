-- Apply once in the Supabase SQL Editor after schema.sql.
-- Called only by Express after validating the requesting user's Supabase token.
drop function if exists public.approve_pair_removal(uuid);

create or replace function public.remove_pairing(actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
  target_data jsonb;
  member_ids uuid[];
begin
  select room_id into target_room_id
  from memberships
  where user_id = actor
  for update;

  if not found then
    raise exception 'There is no active pairing to remove.';
  end if;

  select data into target_data
  from rooms
  where id = target_room_id
  for update;

  if not found then
    raise exception 'The shared space no longer exists.';
  end if;

  select array_agg((profile->>'id')::uuid)
  into member_ids
  from jsonb_array_elements(target_data->'profiles') as item(profile);

  if cardinality(member_ids) <> 2 or not (actor = any(member_ids)) then
    raise exception 'Only a member of this pairing can remove it.';
  end if;

  delete from memberships where room_id = target_room_id;
  delete from rooms where id = target_room_id;
end;
$$;

revoke all on function public.remove_pairing(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_pairing(uuid) to service_role;

-- Let an account with an unpaired one-person space join a different invite.
-- Paired accounts must first remove their current pairing from Connections.
create or replace function public.join_pair(actor uuid, profile jsonb, invite_digest text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_room_id uuid;
  prior_data jsonb;
  target rooms%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));

  select room_id into prior_room_id
  from memberships
  where user_id = actor
  for update;

  if found then
    select data into prior_data
    from rooms
    where id = prior_room_id
    for update;

    if jsonb_array_length(prior_data->'profiles') <> 1
      or (prior_data->'profiles'->0->>'id')::uuid <> actor then
      raise exception 'Remove your current pairing first.';
    end if;
  end if;

  select * into target
  from rooms
  where invite_hash = invite_digest and invite_expires > now()
  for update;

  if not found
    or jsonb_array_length(target.data->'profiles') <> 1
    or (target.data->'profiles'->0->>'id')::uuid = actor then
    raise exception 'That invite is invalid, expired, or already used.';
  end if;

  if prior_room_id is not null then
    delete from memberships where room_id = prior_room_id;
    delete from rooms where id = prior_room_id;
  end if;

  insert into memberships values(actor, target.id);
  update rooms
  set data = jsonb_set(
        jsonb_set(
          data,
          '{profiles}',
          (data->'profiles') || jsonb_build_array(profile || jsonb_build_object('id', actor))
        ),
        '{connectedAt}',
        to_jsonb(now()::text),
        true
      ),
      version = version + 1,
      invite_hash = null,
      invite_expires = null
  where id = target.id;
end;
$$;

revoke all on function public.join_pair(uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.join_pair(uuid,jsonb,text) to service_role;
