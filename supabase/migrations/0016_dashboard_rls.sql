-- ============================================================
-- Live dashboard read access (2026-06-07).
-- scores / team_standings / matches have RLS enabled but no SELECT policy,
-- so clients can't read them. These are non-sensitive, shared-by-design
-- derived/public tables — make them readable by any authenticated player.
-- Writes stay locked down (no insert/update/delete policy; the ingestion
-- pipeline writes via the service-role key, which bypasses RLS).
-- Idempotent — safe to re-run.
-- Canonical design: docs/superpowers/specs/2026-06-07-live-dashboard-design.md
-- ============================================================

drop policy if exists "read scores"          on scores;
drop policy if exists "read team standings"  on team_standings;
drop policy if exists "read matches"         on matches;

create policy "read scores"         on scores         for select to authenticated using (true);
create policy "read team standings" on team_standings for select to authenticated using (true);
create policy "read matches"        on matches        for select to authenticated using (true);
