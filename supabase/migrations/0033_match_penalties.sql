-- ============================================================
-- 0033_match_penalties.sql
-- Penalty-shootout reporting (2026-06-30). Knockout matches decided on penalties
-- were surfacing the shootout-inclusive aggregate as the match score (e.g. a 1–1
-- decided 4–3 on pens showed as "5–4"): football-data's `fullTime` folds the
-- shootout into the score, and the ingest stored that verbatim. Capture the
-- shootout score on its own so the on-pitch result and the pens read separately
-- ("1–1 (4–3 pens)").
--
-- Adds nullable home_penalties / away_penalties (null = no shootout) and teaches
-- the penalties-aware override (0025) to record them. Display-only — scoring runs
-- off winner_team_id, untouched here. Signature change → drop 0025's fn first.
-- Idempotent.
-- ============================================================

alter table matches
  add column if not exists home_penalties int,
  add column if not exists away_penalties int;

drop function if exists public.admin_override_match(uuid, int, int, match_status, uuid);

create function public.admin_override_match(
  p_match_id       uuid,
  p_home_score     int,
  p_away_score     int,
  p_status         match_status,
  p_winner_team_id uuid default null,
  p_home_penalties int default null,
  p_away_penalties int default null
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

  -- Penalties are recorded as an all-or-nothing pair: either both sides of the
  -- shootout or neither (null = no shootout). Reject a half-entered pair so a
  -- lone number never renders as a "0–pens" result.
  if (p_home_penalties is null) <> (p_away_penalties is null) then
    raise exception 'enter both penalty scores or neither';
  end if;

  update matches
     set home_score = p_home_score,
         away_score = p_away_score,
         home_penalties = p_home_penalties,
         away_penalties = p_away_penalties,
         winner_team_id = v_winner,
         status = p_status,
         is_manual_override = true,
         updated_at = now()
   where id = p_match_id;
end;
$$;

grant execute on function
  public.admin_override_match(uuid, int, int, match_status, uuid, int, int)
  to authenticated;
