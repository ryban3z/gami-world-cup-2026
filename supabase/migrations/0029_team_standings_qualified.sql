-- ============================================================
-- 0029_team_standings_qualified.sql
-- Adds a `qualified` flag to the derived team_standings so the dashboard can
-- badge a team "Qualified" the moment it clinches a knockout spot — before the
-- R32 bracket is populated. The recalc job sets it (deriveStandings): true once
-- a team is mathematically guaranteed a top-2 group finish, or once it appears
-- in an R32 fixture (best-3rd qualifiers). Derived/idempotent like the rest of
-- team_standings, so applying the migration then re-running recalc backfills it.
-- ============================================================

alter table team_standings
  add column if not exists qualified boolean not null default false;
