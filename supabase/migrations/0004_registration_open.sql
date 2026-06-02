-- Landing-page "join" CTA control: a single flag the admin flips when ready to
-- invite friends. Exposed to anonymous visitors via a security-definer function
-- that returns ONLY the flag (the rest of game_config stays private to authed users).

alter table game_config
  add column if not exists registration_open boolean not null default false;

create or replace function public.is_registration_open()
returns boolean
language sql
security definer set search_path = public
stable
as $$ select registration_open from game_config where id = 1 $$;

grant execute on function public.is_registration_open() to anon, authenticated;
