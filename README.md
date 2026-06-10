# Gami World Cup '26

A private, mobile-first web app for ~8 friends to run a World Cup 2026 betting pool: snake-draft teams, bonus predictions, points as the tournament progresses, a one-time wildcard, and a knockout-stage re-allocation.

- **Design (source of truth):** `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md`
- **Plans:** `docs/superpowers/plans/`
- **Stack:** Next.js 14 (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), Vercel.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
npm test         # Vitest unit tests
```

## Core-app setup (Supabase)

The landing page runs with no backend. The core app (gate + auth + data) needs a Supabase project.

1. **Create a Supabase project** at https://supabase.com/dashboard.
2. **Copy `.env.local.example` → `.env.local`** and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Project Settings → API.
   - `SUPABASE_SECRET_KEY` — the secret key (used server-side by scoring/cron).
   - `SITE_PASSWORD` — the shared password you hand to friends.
   - `GATE_TOKEN` — any long random string (`openssl rand -hex 32`).
   - `NEXT_PUBLIC_POOL_NAME`, `NEXT_PUBLIC_TROPHY_NAME` — branding (per-deploy).
   - `FOOTBALL_DATA_TOKEN` — football-data.org free API token (results ingestion).
   - `CRON_SECRET` — long random string; Vercel Cron sends it as a bearer token to `/api/cron/ingest`.
3. **Apply the SQL**, in order, via the Supabase **SQL Editor** (paste each file's contents and Run):
   1. `supabase/migrations/0001_initial_schema.sql`
   2. `supabase/migrations/0002_rls_policies.sql`
   3. `supabase/seed/0003_seed_config_categories.sql`
   4. `supabase/seed/teams.generated.sql`
   5. `supabase/migrations/0004_registration_open.sql` — landing-page "join" CTA flag.
   6. `supabase/migrations/0005_draft.sql` — the snake-draft engine (security-definer functions).

   After applying `0005`, verify the engine end-to-end: paste
   `supabase/tests/0005_draft_simulation.sql` into the SQL Editor and Run —
   expect a `DRAFT SIMULATION PASSED` notice (it rolls itself back, leaving no data).
   7. `supabase/migrations/0006_predictions.sql` — bonus-prediction window + save/lock RPCs.

   After applying `0006`, verify it: paste `supabase/tests/0006_predictions_simulation.sql`
   into the SQL Editor and Run — expect a `PREDICTIONS SIMULATION PASSED` notice (it rolls
   itself back, leaving no data).
   8. `supabase/migrations/0007_registered_count.sql` — exposes the registered-player count to the public landing page.
   9. `supabase/migrations/0008_admin_registration.sql` — admin-guarded `set_registration_open` RPC (powers the /admin registration toggle).
   10. `supabase/seed/0009_more_bonus_categories.sql` — three extra bonus categories (Runner-Up, Most Assists, Wooden Spoon). Idempotent; apply before the prediction window opens.
   11. `supabase/migrations/0010_manager_summary.sql` — adds `profiles.summary` (the per-manager profile blurb shown on `/managers/[id]`). (The blurbs themselves are seeded by `0020` below; there is no `0011` file.)
   12. `supabase/seed/0012_seed_matches.sql` — maps `teams.external_id` + seeds the 104 fixtures (results ingestion).
   13. `supabase/migrations/0013_admin_results.sql` — admin override/resolve RPCs + `last_results_sync_at`.
   14. `supabase/seed/0014_scoring_tune.sql` — rebalanced scoring values (apply before kickoff).
   15. `supabase/migrations/0015_single_pick_team_categories.sql` — makes Tournament Winner / Runner-Up / Wooden Spoon single-pick (one slot, not two) and clears any stale slot-2 picks on those categories.
   16. `supabase/migrations/0016_dashboard_rls.sql` — read policies on `scores` / `team_standings` / `matches` so the live dashboard (`/leaderboard` + the home summary) can read them.
   17. `supabase/seed/0017_fix_category_names.sql` — renames the `young_player` bonus category to its official title, "FIFA Young Player Award" (apply before the predictions lock).
   18. `supabase/migrations/0018_avatar_url.sql` — adds `profiles.avatar_url` (manager photo path under `public/managers/`, shown on `/managers/[id]`).
   19. `supabase/seed/0019_manager_avatars.sql` — maps each manager to their committed photo (idempotent `update`s keyed by `display_name`). Apply after the photos are committed under `public/managers/`.
   20. `supabase/seed/0020_manager_summaries.sql` — humorous per-manager blurbs (`profiles.summary`, idempotent `update`s keyed by `display_name`).
   21. `supabase/migrations/0023_chicken_flavour.sql` — adds `profiles.chicken_flavour` (the "fried chicken order" running gag). *No longer rendered — hidden from the profile page 2026-06-10; the column and seed are harmless to keep applying.*
   22. `supabase/seed/0024_chicken_flavours.sql` — the per-manager chicken orders (idempotent `update`s keyed by `display_name`; see the note on step 21).
   23. `supabase/migrations/0025_override_winner.sql` — penalties-aware match override (replaces the `0013` RPC; the override can now record a shootout winner on a level knockout result). **Apply with (or before) deploying the matching app code** — the admin override form passes the new argument.
   24. `supabase/seed/0026_manager_one_liners.sql` — simplified one-line manager bios (supersedes the `0020` blurbs; idempotent `update`s keyed by `display_name`).
4. **Disable email confirmation:** Supabase → Authentication → Sign In / Providers → Email → turn **off "Confirm email"** (so friends can register and log in immediately without an SMTP setup).
5. **Make yourself admin** (after registering): in the SQL Editor, run
   `update profiles set is_admin = true where display_name = '<your name>';`

### Re-seeding teams

The 48 teams are generated from the public-domain [openfootball](https://github.com/openfootball/worldcup.json) dataset:

```bash
node scripts/generate-teams-seed.mjs   # rewrites supabase/seed/teams.generated.sql
```

If openfootball adds a team name the script can't map to a flag, it prints the unmapped names — add them to `scripts/country-iso.json` and re-run.

### Resetting game state (testing)

To rehearse the draft / picks and then start fresh, paste `supabase/dev/reset.sql` into the SQL Editor and Run. It wipes all picks, predictions, scores and ingested matches and resets `game_config` back to the `registration` phase — while keeping registered players, teams, categories, and config. **Run it before the real draft** to clear any test data. ⚠️ Destructive; don't run it mid-tournament.

### ⚠️ Going live: the real draft (runbook)

Two parts — **clean up** the test state first, then **run the game** via the admin panel.

**A. Cleanup (do these before opening registration):**

1. ~~**Remove the UI preview page**~~ — ✅ done before go-live. The public fake-data `/preview/draft` mock and its `middleware.ts` `isPublic()` entry have been removed from the repo (the route no longer exists).
2. Run `supabase/dev/reset.sql` to clear any test draft/picks (resets `game_config` to the `registration` phase).
3. Delete throwaway test accounts from Supabase Auth.
4. Confirm migrations `0008` (admin RPC) and the `0009` categories seed are applied (the admin registration toggle and all 8 bonus categories depend on them).

**B. Run the game (all via `/admin`, visible to admins as a "⚙ Admin" link on `/home`):**

5. **Open registration** → share the site password; friends register at `/gate` → `/register`.
6. When everyone's in, **Start draft** — randomises pick order, closes registration, and opens the bonus-prediction window. ⚠️ One-way; don't hit it early.
7. Run the snake draft. Players pick on their turn; use **Auto-pick for {player}** only after nudging anyone who stalls. The draft auto-reveals (phase → `group_locked`) once the last pick is in.
8. Players fill **bonus predictions** at `/predictions` (all 8 categories) — editable any time until lock.
9. At kickoff (**2026-06-11**), **Lock predictions** — closes the window and reveals everyone's picks. ⚠️ Can't be undone.

## Deploy (Vercel)

Import the repo in Vercel, add every variable from `.env.local.example` as a Project Environment Variable (production values), and deploy. A second group = a separate Vercel project + Supabase project with its own env values.

## Multi-group

Single-tenant by design. To run the pool for another group, deploy a separate instance with its own Supabase project and its own `SITE_PASSWORD` / branding env — no schema or code changes needed.
