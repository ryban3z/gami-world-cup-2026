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
   - `SUPABASE_SECRET_KEY` — the secret key (only needed later, for scoring/cron).
   - `SITE_PASSWORD` — the shared password you hand to friends.
   - `GATE_TOKEN` — any long random string (`openssl rand -hex 32`).
   - `NEXT_PUBLIC_POOL_NAME`, `NEXT_PUBLIC_TROPHY_NAME` — branding (per-deploy).
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
4. **Disable email confirmation:** Supabase → Authentication → Sign In / Providers → Email → turn **off "Confirm email"** (so friends can register and log in immediately without an SMTP setup).
5. **Make yourself admin** (after registering): in the SQL Editor, run
   `update profiles set is_admin = true where display_name = '<your name>';`

### Re-seeding teams

The 48 teams are generated from the public-domain [openfootball](https://github.com/openfootball/worldcup.json) dataset:

```bash
node scripts/generate-teams-seed.mjs   # rewrites supabase/seed/teams.generated.sql
```

If openfootball adds a team name the script can't map to a flag, it prints the unmapped names — add them to `scripts/country-iso.json` and re-run.

## Deploy (Vercel)

Import the repo in Vercel, add every variable from `.env.local.example` as a Project Environment Variable (production values), and deploy. A second group = a separate Vercel project + Supabase project with its own env values.

## Multi-group

Single-tenant by design. To run the pool for another group, deploy a separate instance with its own Supabase project and its own `SITE_PASSWORD` / branding env — no schema or code changes needed.
