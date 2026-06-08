# Manager Profile Pages — Design

**Date:** 2026-06-06
**Status:** Approved for planning
**Depends on:** the built draft + predictions subsystems (Plans 2 & 3). Independent of the not-yet-built scoring subsystem.

## Goal

After the draft is revealed, let any logged-in manager tap another manager and open a
dedicated profile page showing that manager's drafted roster, their bonus predictions, and a
short hand-written "funny summary" blurb. Points/standings are intentionally **out of scope**
for v1 because the scoring subsystem does not exist yet; a profile gains a points section
later, when scoring lands.

> **Visibility update (2026-06-08):** the **entire profile page is sealed until bonus picks
> lock** (`game_config.predictions_locked_at` is set, ~Jun 10) — not just the predictions
> section. The roster cards on `/home` still render post-reveal (they show each manager's
> teams) but are **not clickable** until the lock, and the `/managers/[id]` route itself
> redirects to `/home` while `predictions_locked_at is null` (guarding against typed URLs).
> Locking predictions opens every profile — blurb, photo, Gami order, roster, and picks — at
> once, for a single clean reveal moment. This supersedes the original "open at draft reveal"
> framing below. Also added since v1: per-manager **avatar photo** (`profiles.avatar_url`,
> committed under `public/managers/`) and a **"Gami order"** running-gag line
> (`profiles.chicken_flavour`); both are nullable and seed-driven like `summary`.

> **Terminology:** "managers" are the human players in the pool (the ~9 registered friends),
> each managing a roster of national teams. The route is `/managers/[id]`, where `[id]` is a
> `profiles.id`. This is deliberately **not** about football players — actual footballers
> appear only as plain-text values inside bonus predictions (e.g. a Top Scorer pick).

## Non-goals (v1)

- **No points, standings, or leaderboard.** Added later with the scoring subsystem.
- **No admin summary editor.** Blurbs are delivered as a seed SQL file the user runs; there
  is no in-app editing and therefore no `set_manager_summary` RPC.
- **No Markdown.** Blurbs are plain text; line breaks are preserved on render.
- **No live-draft roster visibility.** The per-manager roster cards (and thus the profile
  links) remain **post-reveal only**, preserving the blind-draft design where a manager sees
  only their own picks until the reveal.
- **No new navigation surface beyond the roster cards.** The only entry point is the existing
  `Rosters` cards on `/home`. (A dedicated `/managers` index can come later.)

## Architecture overview

A new gated route `app/(app)/managers/[id]/page.tsx` renders a manager's profile. It reuses
existing, RLS-safe data paths rather than introducing new visibility logic:

- **Name + summary** — direct `profiles` select. `profiles` is already world-readable to
  authenticated users (`auth read profiles` policy in `0002_rls_policies.sql`), so the new
  `summary` column is readable with no policy change.
- **Roster** — the existing `draft_state()` security-definer RPC (`0005_draft.sql`). It only
  exposes `rosters` after the reveal (`phase` not `registration`/`draft`). The page finds the
  target manager's entry in `rosters` and maps team names/flags via the returned `board`. This
  avoids touching `team_ownership`, which has **no select policy** (deny-by-default; all reads
  go through `draft_state()`).
- **Predictions** — direct `bonus_predictions` + `bonus_categories` select. The
  `read own or revealed bonus predictions` policy (`0006_predictions.sql`) reveals everyone's
  active picks once `game_config.predictions_locked_at` is set, enforcing after-lock
  visibility for free.

Pure shaping logic lives in `lib/managerProfileView.ts` (unit-tested); the page and a
presentational `ManagerProfile` component stay thin.

## Data model change

Migration **`supabase/migrations/0010_manager_summary.sql`**:

```sql
alter table profiles add column summary text;
```

That is the entire schema change. No RPC, no new policy (the existing `auth read profiles`
select policy already covers the new column; no one can write it via the client because there
is no update path granting it — summaries are set only by the seed SQL run in the SQL editor).

Seed **`supabase/seed/0011_seed_summaries.sql`** carries the actual blurbs, written by the
assistant from each manager's picks plus personal facts the user provides:

```sql
update profiles set summary = '<blurb>' where display_name = '<name>';
-- one statement per manager
```

Idempotent by construction (plain `update ... where display_name`). Apply any time after the
draft; re-running overwrites with the same text.

## Route, gating, and navigation

- **Page:** `app/(app)/managers/[id]/page.tsx`, a server component with
  `export const dynamic = "force-dynamic"` (must reflect live phase).
- **Gate:** the gate cookie already covers everything except `/` and `/gate`
  (`middleware.ts` `isPublic`). Add `/managers` to the `needsAuth` check in `middleware.ts`
  so an unauthenticated user is redirected to `/login` (consistent with `/home`, `/draft`,
  `/predictions`, `/admin`).
- **Entry point:** `components/draft/Rosters.tsx` wraps each manager card in a link to
  `/managers/${r.user_id}` using the shared `pressableLink` helper from `lib/ui.ts`. Cards are
  only shown after the reveal, so this is the natural post-draft entry point.

## Page content

Rendered top to bottom:

1. **Header:** manager `display_name`, with "(you)" appended when `[id]` is the viewer; a
   back link to `/home`.
2. **Summary blurb:** the `profiles.summary` text, rendered with `whitespace-pre-line` so the
   plain-text line breaks survive. Omitted entirely when `summary` is null/empty.
3. **Roster:** the manager's drafted teams with flags, in pick order. When the roster is not
   yet visible (phase is `registration`/`draft`, i.e. `draft_state()` returned no `rosters`),
   show "Roster hidden until the draft is revealed." instead.
4. **Bonus predictions:** grouped by category — category name followed by the manager's
   active pick(s). When predictions are not yet locked
   (`game_config.predictions_locked_at is null`) and the profile is not the viewer's own,
   show "Predictions hidden until kickoff lock." (RLS also enforces this; the message avoids
   an empty section.)
5. **Points:** a single muted line, "Points will appear here once matches begin." — a
   user-facing note, not a dev placeholder. The real section is added with scoring.

## View model and pure logic

`lib/managerProfileView.ts` exports `buildManagerProfileView(input)`:

**Input** (already-fetched raw data):
- `displayName: string`
- `summary: string | null`
- `isSelf: boolean`
- `rosters: Roster[] | null` and `board: BoardTeam[]` from `draft_state()` (reuse the
  `Roster` / `BoardTeam` types already exported from `components/draft/DraftStatus`)
- `targetUserId: string`
- `predictionsLockedAt: string | null`
- `categories: { id; name }[]` — active categories in display order (`bonus_categories`,
  e.g. "Top Scorer (Golden Boot)")
- `predictions: { category_id; pick_slot; pick_value }[]` — this manager's active picks
  (filtered to active rows by the query / RLS)

The builder joins predictions to category names itself (iterating `categories` in order), so
ordering is deterministic and unit-testable rather than relying on query order.

**Output view model:**
- `displayName`, `summary` (trimmed; `null` if empty)
- `isSelf`
- `rosterVisible: boolean` (true once revealed, i.e. `draft_state()` returned a non-null
  `rosters` array)
- `teams: { name; flagUrl }[]` (empty when not visible; mapped from `board`, in pick order;
  a missing board entry falls back to name `"—"`, no flag)
- `predictionsVisible: boolean` (`predictionsLockedAt != null || isSelf`)
- `predictionsByCategory: { categoryName; picks: string[] }[]` (empty when not visible;
  picks ordered by `pick_slot`)

Keeping this pure means the page just fetches + passes data in, and the component just renders
the view model.

## Components

- `app/(app)/managers/[id]/page.tsx` — fetch `profiles` (name, summary) for `[id]`, the
  viewer via `supabase.auth.getUser()`, `draft_state()`, and `bonus_predictions` joined to
  `bonus_categories` for `[id]`. Call `notFound()` when no profile row matches `[id]`. Build
  the view model and render `ManagerProfile`.
- `components/managers/ManagerProfile.tsx` — presentational; renders the five sections above.
  Reuses the flag `<img>` treatment from `Rosters.tsx`.
- `components/draft/Rosters.tsx` — modified so each card links to the profile.

## Error handling & edge cases

- **Unknown `[id]`:** `notFound()` → Next 404.
- **Pre-reveal direct hit:** name + blurb render; roster shows the hidden message; predictions
  show the hidden message.
- **Manager with no summary:** blurb section omitted.
- **Manager who hasn't made all predictions:** only their active picks show; categories with
  no pick are simply absent.
- **Viewing own profile pre-lock:** predictions visible to self (`isSelf` branch), matching
  the `bonus_predictions` self-read policy.

## Testing

- **`lib/managerProfileView.test.ts`** (Vitest): roster hidden when `rosters` is null vs
  mapped when present; missing board entry → `"—"`; predictions hidden when
  `predictionsLockedAt` is null and not self, visible when locked, visible when self pre-lock;
  picks ordered by `pick_slot`; empty/whitespace summary → `null`.
- **Build/type checks:** `npx tsc --noEmit` and `npm run build` (presentational components are
  verified here, not unit-tested, per project convention). `npm run lint` is avoided (hangs).

## Apply order (README update)

After the existing list, add:

```
11. supabase/migrations/0010_manager_summary.sql — adds profiles.summary (manager blurb).
12. supabase/seed/0011_seed_summaries.sql         — the manager summary blurbs.
```

## Files

**Create**
- `app/(app)/managers/[id]/page.tsx`
- `components/managers/ManagerProfile.tsx`
- `lib/managerProfileView.ts`
- `lib/managerProfileView.test.ts`
- `supabase/migrations/0010_manager_summary.sql`
- `supabase/seed/0011_seed_summaries.sql`

**Modify**
- `middleware.ts` — add `/managers` to `needsAuth`
- `components/draft/Rosters.tsx` — clickable cards linking to `/managers/[id]`
- `README.md` — apply order for `0010`/`0011`
