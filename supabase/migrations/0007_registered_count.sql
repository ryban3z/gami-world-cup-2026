-- Landing-page hype: expose ONLY the number of registered players to anonymous
-- visitors via a security-definer function (profiles itself stays readable to
-- authenticated users only — this leaks just the count, nothing else).

create or replace function public.registered_count()
returns int
language sql
security definer set search_path = public
stable
as $$ select count(*)::int from profiles $$;

grant execute on function public.registered_count() to anon, authenticated;
