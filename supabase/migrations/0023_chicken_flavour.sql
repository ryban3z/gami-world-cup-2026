-- ============================================================
-- 0023_chicken_flavour.sql
-- Adds a tongue-in-cheek "fried chicken order" line per manager, shown on
-- /managers/[id] (profiles.chicken_flavour) — a running gag across the pool.
--
-- Readable by all authenticated users via the existing `auth read profiles`
-- SELECT policy (0002_rls_policies.sql). No client write path is granted, so
-- it's set only via the seed (0024), run in the SQL editor. Null is allowed —
-- the profile page omits the line.
-- ============================================================

alter table profiles add column if not exists chicken_flavour text;
