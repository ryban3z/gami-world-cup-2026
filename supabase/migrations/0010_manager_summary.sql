-- ============================================================
-- 0010_manager_summary.sql
-- Adds a free-text "funny summary" blurb per manager, shown on /managers/[id].
--
-- Readable by all authenticated users via the existing `auth read profiles`
-- SELECT policy (0002_rls_policies.sql). No client write path is granted, so
-- summaries can only be set via the seed (0011), run in the SQL editor.
-- ============================================================

alter table profiles add column if not exists summary text;
