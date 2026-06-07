# Minor Fixes & Tweaks — running backlog

Small bugs and polish items to batch into a future round. Not full plans — each is a
self-contained note with enough detail to act on. Check off when done.

---

## Open

### [ ] "Last synced" timestamp shows US format + UTC, not local

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

### [ ] Cooldown + warning on the "Refresh results now" button

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
