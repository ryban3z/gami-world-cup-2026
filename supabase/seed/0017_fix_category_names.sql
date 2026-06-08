-- ============================================================
-- 0017_fix_category_names.sql
-- Correct bonus award names to their official titles (2026-06-08).
-- "Best Young Player" was not the real award name — FIFA calls it the
-- "FIFA Young Player Award". Keyed on the stable `key`, so it's idempotent
-- and safe to re-run. Apply before the predictions lock / kickoff.
--
-- The other categories were reviewed and left as-is: the Golden Boot/Ball/Glove
-- subtitles are clear, and Tournament Winner / Runner-Up / Wooden Spoon /
-- Most Assists are pool-specific (not official FIFA awards).
-- ============================================================

update bonus_categories set name = 'FIFA Young Player Award' where key = 'young_player';
