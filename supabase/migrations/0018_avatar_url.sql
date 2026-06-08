-- ============================================================
-- 0018_avatar_url.sql
-- Adds a per-manager avatar image path, shown on /managers/[id].
--
-- The value is a repo-relative path under public/ (e.g. '/managers/hans.jpg'),
-- served as a static asset by Vercel — images are committed to the repo, not
-- uploaded to Supabase Storage. Readable by all authenticated users via the
-- existing `auth read profiles` SELECT policy (0002_rls_policies.sql). No client
-- write path is granted, so avatars are set only via the seed (0019), run in the
-- SQL editor. Null is allowed — the profile page falls back to initials.
-- ============================================================

alter table profiles add column if not exists avatar_url text;
