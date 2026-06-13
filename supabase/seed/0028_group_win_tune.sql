-- ============================================================
-- 0028_group_win_tune.sql
-- Group-stage points tweak (2026-06-13): reward each group-stage win and shade
-- the qualify reward down to compensate, so the leaderboard moves from matchday
-- one instead of staying flat until the group stage ends. Knockout ladder, bonus,
-- and champion values are unchanged from 0014. Idempotent; safe to re-run.
-- Apply after migration 0027, then run a manual recalc in /admin (recalc rebuilds
-- from scratch, so already-played group matches are credited retroactively).
-- ============================================================

update scoring_config
   set group_qualify_pts = 4,   -- was 5
       group_win_pts     = 1     -- per group-stage win
 where id = 1;
