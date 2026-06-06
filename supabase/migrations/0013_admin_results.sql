-- ============================================================
-- 0013_admin_results.sql
-- Admin tools for the scoring subsystem: manual match override and free-text
-- bonus resolution. Both self-guard on profiles.is_admin (mirrors 0008).
-- Also adds game_config.last_results_sync_at (set by the ingest pipeline).
-- ============================================================

alter table game_config add column if not exists last_results_sync_at timestamptz;

-- Override a fixture's result. Sets is_manual_override so the cron won't clobber it.
create or replace function public.admin_override_match(
  p_match_id   uuid,
  p_home_score int,
  p_away_score int,
  p_status     match_status
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_home uuid; v_away uuid; v_winner uuid;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can override a match';
  end if;
  select home_team_id, away_team_id into v_home, v_away from matches where id = p_match_id;
  v_winner := case
    when p_home_score > p_away_score then v_home
    when p_away_score > p_home_score then v_away
    else null end;
  update matches
     set home_score = p_home_score,
         away_score = p_away_score,
         winner_team_id = v_winner,
         status = p_status,
         is_manual_override = true,
         updated_at = now()
   where id = p_match_id;
end;
$$;

-- Resolve a bonus category (the answer scoring compares against).
create or replace function public.admin_resolve_category(
  p_category_id uuid,
  p_answer      text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can resolve a category';
  end if;
  update bonus_categories
     set resolved_answer = nullif(btrim(p_answer), '')
   where id = p_category_id;
end;
$$;

grant execute on function public.admin_override_match(uuid, int, int, match_status) to authenticated;
grant execute on function public.admin_resolve_category(uuid, text) to authenticated;
