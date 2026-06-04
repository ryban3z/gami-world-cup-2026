-- ============================================================
-- Admin registration toggle (Admin control panel).
-- The registration_open column already exists (0004). This adds an
-- admin-guarded setter so the /admin page can open/close registration
-- with a button instead of a manual SQL update. Guard mirrors
-- lock_predictions() in 0006.
-- Canonical design: docs/superpowers/specs/2026-06-04-admin-page-design.md
-- ============================================================

create or replace function public.set_registration_open(p_open boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can change registration';
  end if;
  update game_config set registration_open = p_open where id = 1;
end;
$$;

grant execute on function public.set_registration_open(boolean) to authenticated;
