-- ============================================================
-- 0027_group_win_points.sql
-- Adds a per-group-win scoring lever so points start flowing during the group
-- stage (previously nothing scored until a team reached R32). Credited to the
-- phase='group' owner, like the qualify reward. Default 0 keeps this inert until
-- the value is set in seed 0028, so applying the migration alone changes nothing.
-- ============================================================

alter table scoring_config
  add column if not exists group_win_pts int not null default 0;  -- per group-stage win → phase='group' owner
