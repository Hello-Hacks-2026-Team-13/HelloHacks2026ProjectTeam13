-- Run once on an existing Supabase project to remove Google Calendar sync data.
-- Exporting saved plans as .ics files does not use these tables.
drop table if exists public.calendar_tokens cascade;
drop table if exists public.oauth_states cascade;

-- Remove the old connection flag from profiles stored in room JSON.
update public.rooms
set data = jsonb_set(
  data,
  '{profiles}',
  coalesce(
    (
      select jsonb_agg(profile - 'calendarConnected' order by ordinal)
      from jsonb_array_elements(data->'profiles') with ordinality as p(profile, ordinal)
    ),
    '[]'::jsonb
  )
), version = version + 1
where data ? 'profiles';
