-- ============================================================
-- 0014_scoring_tune.sql
-- Rebalanced scoring (2026-06-06): team-picking is the focus, bonus is
-- complementary, knockout ladder flattened. Overwrites the values seeded in
-- 0001. Idempotent; safe to re-run. Apply any time before kickoff.
-- ============================================================

update scoring_config
   set group_qualify_pts = 5,
       bonus_correct_pts = 4,
       champion_pts      = 6
 where id = 1;

-- Knockout ladder by furthest stage reached. r32 stays 0 (eliminated in R32).
update scoring_rules set points = 6  where stage = 'r16';
update scoring_rules set points = 10 where stage = 'qf';
update scoring_rules set points = 14 where stage = 'sf';
update scoring_rules set points = 18 where stage = 'final';
