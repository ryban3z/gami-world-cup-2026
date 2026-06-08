# Minor Fixes & Tweaks — running backlog

Small bugs and polish items to batch into a future round. Not full plans — each is a
self-contained note with enough detail to act on. Check off when done.

---

## Open

### [x] Pull "Recent results" + "Next up" onto the home page

**Where:** `app/(app)/home/page.tsx`. Reuse the already-built `components/leaderboard/MatchStrip.tsx`
+ `buildMatchStrip` from `lib/leaderboardView.ts` (currently only on `/leaderboard`).

**Why:** the match strip (recent finished results + next upcoming fixtures) lives only on the
full `/leaderboard` route today. Surfacing a compact version on `/home` puts "what just happened /
what's next" in front of players without a tap-through — `/home` is the page everyone lands on.

**Fix:** in `home/page.tsx`, add a `matches` query to the existing `Promise.all`
(`id, stage, group_letter, home_team_id, away_team_id, kickoff_at, home_score, away_score,
winner_team_id, status`); `teams` is already fetched there. Then:

```ts
import MatchStrip from "@/components/leaderboard/MatchStrip";
import { buildMatchStrip } from "@/lib/leaderboardView";
// ...
const strip = revealed ? buildMatchStrip(matches ?? [], teams ?? [], { recent: 3, upcoming: 3 }) : null;
```

Render `{revealed && strip && <MatchStrip recent={strip.recent} upcoming={strip.upcoming} />}` below
the rosters. Keep the counts small (3/3) so home stays compact; the full strip stays on
`/leaderboard`. Phase-gate on the existing `revealed` flag (live phases only).

**Test:** `buildMatchStrip` is already unit-tested; presentational reuse. Verify via `npm run build`.

---

### [ ] Show available free agents below the rosters on home

**Where:** `app/(app)/home/page.tsx` (a new read-only panel below the Rosters section). This is the
home-surface slice of the larger **knockout re-allocation** subsystem — see the *Knockout
Re-allocation* section of `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` (free-agent
pickup + the PLANNED blind ranked-preference allocation).

**Why:** after the group stage, each manager may claim **one unowned team that advanced to the
Round of 32**. Surfacing the pool of available free agents (qualified-but-undrafted teams) below the
rosters makes it obvious what's claimable heading into / during the swap window.

**Fix (read-only display only):** free agents = teams that reached R32 (have a `team_standings` row
with `furthest_stage` ≥ `r32` / not eliminated in groups) **and** have no `team_ownership` row at
`phase='group'` (undrafted). Shape this in a pure `lib/*View.ts` helper (+ colocated Vitest test, per
convention) and render a flag+name list below the Rosters section, **phase-gated to
`knockout_realloc`** (optionally also `knockout_locked` / `complete` for reference). Sort by furthest
stage reached, then name.

**Note — scope boundary:** this entry is *just the read-only "what's available" panel*. The actual
swap submission (each manager submits the team they'll drop + a ranked wishlist, blind, auto-resolved
in pick order) is the full knockout re-allocation feature and needs its own **spec → plan** pass —
don't fold the mutation/RLS/resolver work into this backlog item. Decide whether to ship the
free-agents panel standalone first or as part of that build.

**Test:** pure helper unit-tested; panel via `npm run build`.

---

### [x] "Last synced" timestamp shows US format + UTC, not local

**Where:** `app/(app)/admin/page.tsx` — the Results section renders
`Last synced: {new Date(lastSync).toLocaleString()}`.

**Problem:** It's a server component, so `toLocaleString()` runs on Vercel (US locale → `m/d/y`,
and UTC timezone). The admin (non-American) sees e.g. `6/7/2026, 8:19:53 AM` instead of
`7/06/2026, ...` in their own local time.

**Fix:** Format on the client so it uses the browser's locale + timezone. Extract a tiny client
component, e.g. `components/admin/SyncedAt.tsx`:

```tsx
"use client";
export default function SyncedAt({ iso }: { iso: string | null }) {
  if (!iso) return <>never</>;
  // Browser locale + timezone; day-first via en-GB as a sensible default.
  return <>{new Date(iso).toLocaleString("en-GB")}</>;
}
```

Then in the admin page replace the inline `new Date(lastSync).toLocaleString()` with
`<SyncedAt iso={lastSync} />`. (Using `"en-GB"` gives d/m/y; or omit the locale arg to fully
defer to the viewer's browser locale — decide which when implementing.)

**Test:** presentational; verify via `npm run build`.

---

### [x] Cooldown + warning on the "Refresh results now" button

**Where:** `app/(app)/admin/actions.ts` (`refreshResults`) + the Results section in
`app/(app)/admin/page.tsx`.

**Why:** football-data.org free tier is **10 requests/minute**; each refresh is 1 API call. Not
fragile (you'd need ~10 clicks in 60s to hit it, and a 429 fails safely — fetch throws before
any DB write), but there's currently no guard against impatient mashing, and the daily cron
already covers normal updates.

**Fix (server-side cooldown — can't be bypassed by double-click):** in `refreshResults`, read
`game_config.last_results_sync_at` and refuse if it was within the last ~30–60s:

```ts
// inside refreshResults, after requireAdmin()
const supabase = createClient();
const { data: cfg } = await supabase
  .from("game_config").select("last_results_sync_at").eq("id", 1).single();
if (cfg?.last_results_sync_at &&
    Date.now() - new Date(cfg.last_results_sync_at).getTime() < 30_000) {
  back("Just synced — wait a moment before refreshing again.");
}
// ...then runIngest() as before
```

**Plus** a small caption under the button, e.g. "Auto-syncs daily; manual refresh is rate-limited
to once every 30s." (`ConfirmAction` already disables the button while a refresh is in flight, so
this only adds the post-completion cooldown.)

**Test:** the cooldown branch is logic worth a quick unit extraction if convenient; otherwise
verify via `npm run build` + a manual double-click.

---

### [ ] Per-pick bonus breakdown on the leaderboard

**Where:** `lib/scoring.ts` (`computeScores`) + `lib/scoring.test.ts`; consumed by the leaderboard
tap-to-expand panel (`components/leaderboard/LeaderboardTable.tsx`, `lib/leaderboardView.ts`).

**Why:** the live dashboard (spec `docs/superpowers/specs/2026-06-07-live-dashboard-design.md`)
ships with only an aggregate "Bonus: N pts" line. Bonus categories (Tournament Winner, Golden
Boot, awards, etc.) almost all resolve at tournament's end, so per-pick detail has nothing to show
during the group stage / most knockouts — deferred to keep the scoring engine untouched at launch.

**Fix (when awards start landing, near tournament end):** add a `bonus_hits: [{category, pick,
points}]` array to the `breakdown` jsonb inside `computeScores` (push an entry whenever a bonus pick
matches `resolved_answer`). Since `scores` is recomputed from scratch each recalc, the next sync
backfills it — no migration needed. Then surface it in `buildLeaderboard` (`LeaderRow.bonusHits`)
and render a "Bonus picks" sub-list in the expand panel.

**Test:** extend `lib/scoring.test.ts` for the `bonus_hits` shape; extend `lib/leaderboardView.test.ts`
for rendering; components via `npm run build`.

---

### [x] Add Vercel Analytics

**Where:** `app/layout.tsx` (root layout) + `package.json`.

**Why:** lightweight, privacy-friendly page-view analytics for the deployed app — see how the
friends actually use it during the tournament. Free on Vercel Hobby; zero config beyond the package
+ component.

**Fix:**

1. Install: `npm i @vercel/analytics`
2. In `app/layout.tsx`, import and render the component inside `<body>`:

```tsx
import { Analytics } from "@vercel/analytics/next";

// …inside RootLayout's <body>, after {children}:
<body className="font-sans">
  {children}
  <Analytics />
</body>
```

3. Enable Analytics for the project in the Vercel dashboard (Project → Analytics tab) if not
   already on. No env vars needed.

**Test:** `npm run build`; after deploy, confirm hits appear in the Vercel Analytics tab.
