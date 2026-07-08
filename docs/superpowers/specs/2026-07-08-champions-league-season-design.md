# Champions League 2026/27 Pool — High-Level Idea (DRAFT)

**Status: idea / early draft — to be refined before any build work.** Captured 2026-07-08, while the World Cup pool is mid-tournament. Nothing here is committed; treat every section as a proposal. The WC spec (`2026-05-28-world-cup-pool-design.md`) remains the canonical reference for the mechanics we'd be adapting.

## One-liner

Run the same private pool for the **UEFA Champions League 2026/27 season**: snake-draft the 36 league-phase clubs, submit bonus predictions before matchday 1, accumulate points across the league phase and knockouts, with the wildcard + re-allocation mechanics adapted to the CL calendar.

## Why it works (and why it's tempting)

- The core engine — phase state machine, blind-submit/reveal-after RLS model, snake draft, ownership-phase scoring split, ingest → idempotent recalc pipeline, admin panel — is **competition-agnostic**. Most of the build is reusable as-is.
- The multi-group decision (spec, 2026-06-02) already says a new pool = a **separate deploy** (own Vercel + Supabase project, branding/password from env). A new *season/competition* is the same shape, one step further: separate deploy **plus** a fork/branch with competition-specific changes.
- The CL calendar is actually *friendlier* than the WC's: the gap between the league phase ending (late Jan 2027) and the knockout play-offs (mid Feb) is **~2–3 weeks**, so the re-allocation window doesn't need the WC's awkward "open early, snapshot at resolve" workaround.
- football-data.org's **permanently-free tier includes the Champions League** (competition code `CL`), so the results feed carries over. *(Verify 2026/27 fixtures populate once the league-phase draw happens — same spike as the WC one on 2026-06-02.)*

## CL 2026/27 format primer (what the app must model)

- **36 clubs**, single **league phase** (Swiss model): each club plays **8 matches** (4 home, 4 away) against 8 different opponents; one combined 36-team table. No groups.
- League table outcome: **top 8 → Round of 16 directly**; **9th–24th → knockout play-offs** (two-legged, seeded); **25th–36th → eliminated** (no Europa League parachute).
- Knockouts: **play-off round → R16 → QF → SF** (all two-legged) → **single-leg final** (May/June 2027).
- Calendar: field known **late Aug 2026** (after qualifying + draw); league phase **Sept 2026 – late Jan 2027**; play-offs Feb; final ~9 months after kickoff.
- **Draws are common and matter** (league points 3/1/0), unlike WC group play where we chose to score wins only.

## What carries over unchanged

- Phase state machine (`game_config.current_phase`), admin-triggered transitions, two-step confirms.
- Shared-password gate + display-name auth (`lib/identity.ts`).
- Snake-draft engine (`start_draft` / `make_pick` / `admin_autopick` / `draft_state`) — only the team count and per-manager count change.
- Bonus predictions submit/lock/reveal flow, wildcard-as-superseding-row model.
- `team_ownership.phase` split (`group` → rename/alias to `league` conceptually, see below) and the derived/rebuildable `scores` + `team_standings` invariant.
- Ingest pipeline shape (`lib/footballData.ts` → `lib/pipeline.ts` → cron), manual override, admin results tools.
- Leaderboard / manager profiles / dashboard, `lib/*View.ts` + Vitest convention, mobile-first UI kit.

## What has to change (the real work)

| WC concept | CL 2026/27 adaptation |
|---|---|
| 48 teams, 12 groups | 36 clubs, one league table. Kill all group-keyed logic/UI (group badges, per-group boards). |
| 8 managers × 3 teams = 24 drafted, 24 free | **Open question:** 4 each (32 drafted, only 4 free agents — thin realloc pool) vs 3 each (24 drafted, 12 free — better realloc, but managers idle on fewer clubs across 9 months). Leaning **4 each** and redesigning realloc supply (see below). |
| `deriveGroupQualified` — 3^n enumeration per group (n ≤ 6) | **Cannot port**: one 36-team league with dozens of remaining fixtures makes enumeration infeasible. Replace with either (a) credit qualification tiers only when the league phase **completes**, or (b) a much simpler clinch bound off the live table (a team on X pts with Y games left is guaranteed top-24 when ≤ 23 others can pass it — the "rivals play each other" subtlety matters less for top-24 than it did for top-2). Probably (a) for v1: the league phase ends on a single simultaneous matchday anyway. |
| Group reward: 1/win + 4 qualify | League-phase reward, e.g. **1/win (maybe ½ or 1 for a draw — decide)** + tiered qualify: smaller reward for reaching the play-offs (9th–24th), bigger for **top-8 direct R16**. Values TBD via `scoring_config` (already tunable). |
| Knockout ladder r32→…→champion (`furthest_stage`) | New ladder: **playoff → R16 → QF → SF → final → champion**. `furthest_stage` enum + points need a migration; two-legged ties collapse fine into "furthest stage reached" (score the tie, not the legs — but ingest must aggregate two legs to decide who advanced). |
| Realloc after groups, window squeezed before R32 | Realloc between league phase and play-offs — **a real 2–3 week window**, so it can open *after* final standings exist: snapshot order at open, no snapshot-at-resolve hack. Consider whether claims should come from eliminated-manager drops too, given the tiny undrafted pool. |
| One wildcard at the realloc window | Season is 9 months — consider **two windows** (mid-league-phase + pre-knockout) or keep one; TBD. |
| Bonus categories (8) | Mostly rename/keep: Top Scorer, Best Player (UEFA POTS), Most Assists, Young Player, Winner, Runner-Up. Wooden Spoon → "worst league-phase club" (fewest points, GD tiebreak — same 2026-07-05 rule, now on one table). Possible CL-specific adds: "first manager sacked"-style fun picks — TBD. |
| Seed: openfootball/worldcup.json | openfootball likely won't have 2026/27 CL early/reliably — plan to **seed teams + fixtures from football-data.org itself** (one-off admin/seed script), keep it as the results feed too. Re-run the feed spike once the draw is out (~late Aug 2026). |
| 5-week tournament, daily cron | 9-month season, matches mostly Tue/Wed (+ some Thu). Same daily cron works; maybe bump frequency on matchdays only. Long idle weeks → engagement is the risk; this is where the **in-tournament bonus mini-games** (still unbuilt, spec'd as future) would earn their keep. |

## Repo strategy (proposal)

**Fork the repo per the existing multi-group model** (`gami-champions-league-2027` or similar), don't retrofit multi-competition config into this one. Rationale: the single-tenant/separate-deploy decision already accepted fork-per-instance; the CL delta (stage enum, qualify logic, group removal, scoring values) is a focused set of migrations + `lib/scoring.ts` changes on a fork, vs. a risky generalization of a live in-tournament app. Cherry-picking fixes across forks is the accepted cost.

Alternative (rejected for now, revisit if a third competition appears): extract a `competition.ts` config (stages, ladder, team count, qualify rule) and make this repo multi-competition.

## Rough timeline

- **Now – Aug 2026:** nothing to build; WC pool is live. Refine this doc after the WC final (lessons learned: what scored well, what flopped).
- **Late Aug 2026:** league-phase draw → field known. Re-run the football-data.org spike for `CL` 2026/27. Fork + rebrand (env), seed clubs.
- **Early Sept 2026:** registration + draft + predictions must lock by **matchday 1 (~Sept 15)**. This is the only hard deadline; everything knockout-side has until Jan 2027.
- **Sept 2026 – Jan 2027:** league-phase scoring live; build knockout-ladder + realloc adaptations at leisure; ship mini-games if desired.

## Open questions

1. Teams per manager: 4 (drafts 32/36) vs 3 (24/36)? Interacts directly with realloc pool size.
2. Score draws in the league phase, or wins only (WC precedent)?
3. Qualify reward tiers: how to split play-off qualification vs top-8 direct entry (and does 25th–36th elimination deserve a wooden-spoon-adjacent penalty/reward)?
4. One wildcard window or two, over a 9-month season?
5. Realloc supply: undrafted-only (WC model) or allow claiming clubs dropped by other managers this time?
6. Do we finally build the in-tournament bonus mini-games? A long season makes them much more valuable than they were for the WC.
7. Same ~8 managers, or a different/bigger group? (Affects draft math everywhere.)
