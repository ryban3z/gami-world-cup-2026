-- ============================================================
-- 0025_override_winner.sql
-- Penalties-aware match override (2026-06-10). Knockout matches can end level
-- and be decided on penalties, but the 0013 override derived the winner purely
-- from the scores (level → null winner → no knockout-ladder points). Adds an
-- explicit p_winner_team_id, required when a non-group result is final and
-- level. Signature change → drop the 0013 function first. Idempotent.
-- ============================================================

drop function if exists public.admin_override_match(uuid, int, int, match_status);
drop function if exists public.admin_override_match(uuid, int, int, match_status, uuid);

create function public.admin_override_match(
  p_match_id       uuid,
  p_home_score     int,
  p_away_score     int,
  p_status         match_status,
  p_winner_team_id uuid default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_home uuid; v_away uuid; v_stage match_stage; v_winner uuid;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can override a match';
  end if;
  select home_team_id, away_team_id, stage into v_home, v_away, v_stage
    from matches where id = p_match_id;
  if not found then
    raise exception 'unknown match';
  end if;

  if p_winner_team_id is not null then
    if p_winner_team_id is distinct from v_home
       and p_winner_team_id is distinct from v_away then
      raise exception 'winner must be one of the two teams in the match';
    end if;
    v_winner := p_winner_team_id;
  else
    v_winner := case
      when p_home_score > p_away_score then v_home
      when p_away_score > p_home_score then v_away
      else null end;
  end if;

  -- A finished knockout match must have a winner (penalties decide level ones).
  if v_winner is null and p_status = 'final' and v_stage <> 'group' then
    raise exception 'level knockout result — pick the penalty-shootout winner';
  end if;

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

grant execute on function public.admin_override_match(uuid, int, int, match_status, uuid) to authenticated;
