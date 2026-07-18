-- 0034_complete_tournament.sql
-- The final phase transition: knockout_locked → complete.
--
-- The `complete` phase has existed in the game_phase enum since 0001 and is
-- referenced defensively across RLS / scoring / reveal logic, but nothing ever
-- SET current_phase = 'complete' — there was no path into it, so the pool could
-- never be formally closed out after the final. This adds the admin-only
-- complete_tournament() RPC that freezes the standings and flips the phase. The
-- /results winners view and the leaderboard's 🏆 marker read off this phase.
--
-- Scoring is already fully materialized by the daily cron / manual refresh
-- recalc (champion bonus included), so completing the tournament does not
-- recompute anything — the admin server action runs a final recalc first, then
-- calls this. Idempotent-safe: it errors rather than double-flipping if the
-- game isn't sitting in knockout_locked.

create or replace function public.complete_tournament()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can complete the tournament';
  end if;

  if (select current_phase from game_config where id = 1) <> 'knockout_locked' then
    raise exception 'the tournament can only be completed from the knockout_locked phase';
  end if;

  -- Guard: don't close out before the final has actually been played, so the
  -- champion bonus + is_champion standings are locked in. The final is the
  -- single stage='final' fixture; require it decided with a winner.
  if not exists (
    select 1 from matches
    where stage = 'final' and status = 'final' and winner_team_id is not null
  ) then
    raise exception 'the final has not been played yet — refresh results before completing';
  end if;

  update game_config
     set current_phase = 'complete',
         updated_at = now()
   where id = 1;
end;
$$;

grant execute on function public.complete_tournament() to authenticated;
