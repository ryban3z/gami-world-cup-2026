# Knockout Re-allocation + Wildcard Implementation Plan

**Goal:** The `knockout_realloc` phase — each manager may make one optional **blind, editable team swap** (drop one owned team + a ranked top-3 wishlist of **undrafted** teams, auto-resolved worst-placed-first) and one optional **wildcard** (change a single bonus pick — one slot). The admin opens the window **during the group stage** and resolves it (snapshots the reverse-standings order from final standings, auto-allocates teams that reached R32, materializes knockout ownership, applies wildcards, locks).

> **Amendments (post-build, confirmed with user):**
> 1. **Single-pick wildcard** — the wildcard changes one bonus pick (one slot), not a whole category.
> 2. **Open early + snapshot at resolve** — the window opens during the group stage (the gap before R32 is < 1 day), so managers rank from the **undrafted pool** (flagged qualified/eliminated) and the reverse-standings order is snapshotted **at resolve** (final standings), not at open. Only ranked teams that actually reached R32 are awarded.
> 3. **Editable wildcard** — the wildcard is a **pending** choice (`wildcard_choices` table; `set_wildcard` / `clear_wildcard`), editable until resolve, then applied. New helper `_knockout_claimable_team_ids()` (undrafted pool) backs submission/display; `_knockout_free_agent_ids()` (reached-R32) gates awarding at resolve.

**Architecture:** Mirrors the snake-draft + predictions stack exactly. One migration (`0030`) repurposes the dormant `swap_nominations` table, adds `game_config.knockout_order`, and adds five `security definer` RPCs; `knockout_realloc_state()` is the single blind-during / reveal-after read window (like `draft_state()`). A one-line change in `lib/scoring.ts` makes knockout ownership authoritative once materialized. Pure pick-order math lives in `lib/knockoutView.ts`; presentational forms + a gated `/knockout` server component render it; two `ConfirmAction` admin controls drive the transitions.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` (Knockout Re-allocation).

**Decisions (confirmed with user):** build both features together; wishlist capped at **top 3**; wildcard replaces **a single pick** (one slot, leaving the other untouched).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0030_knockout_realloc.sql` | create | repurpose `swap_nominations`; `knockout_order` column; `_knockout_free_agent_ids` + `open_knockout_realloc` / `submit_swap_nomination` / `use_wildcard` / `resolve_knockout_realloc` / `knockout_realloc_state` RPCs; blind-then-reveal RLS |
| `supabase/tests/0030_knockout_realloc_simulation.sql` | create | self-asserting, rolled-back end-to-end SQL verification |
| `lib/scoring.ts` | edit | `koOwner`: knockout map authoritative once `knockoutOwner.size > 0`, else group-owner fallback |
| `lib/scoring.test.ts` | edit | materialized fixture + realloc cases (swap-in earns, dropped earns nothing, do-nothing keeps, pre-realloc fallback) |
| `lib/knockoutView.ts` (+ `.test.ts`) | create | `reallocPickOrder` (reverse standings, reverse-snake tiebreak) + `freeAgentsByGroup` |
| `app/(app)/knockout/page.tsx` | create | gated server component; calls `knockout_realloc_state`; renders swap + wildcard or revealed results |
| `app/(app)/knockout/actions.ts` | create | `submitSwapNomination` + `useWildcard` server actions |
| `components/knockout/SwapForm.tsx` | create | drop select + ranked top-3 free-agent selects |
| `components/knockout/WildcardForm.tsx` | create | one form per pick (slot) — replace a single bonus pick (team dropdown vs free text) |
| `app/(app)/admin/page.tsx` + `actions.ts` | edit | `openKnockoutRealloc` (group_locked) + `resolveKnockoutRealloc` (knockout_realloc, runs recalc) controls |
| `app/(app)/home/page.tsx` | edit | `/knockout` nav CTA during `knockout_realloc` / `knockout_locked` |
| `supabase/dev/reset.sql` | edit | reset `knockout_order` |
| `README.md`, `CLAUDE.md`, spec | edit | migration sequence + mark built |

## Key invariants honoured

- **Ownership-phase split:** group qualify/win points stay with the `phase='group'` owner; the knockout ladder routes to the `phase='knockout'` owner. `resolve_knockout_realloc()` materializes a full knockout roster for every manager (kept + claimed; dropped teams left unowned) and is the only path to `knockout_locked`, so a dropped team's ladder points go to no one.
- **Blind-during / reveal-after** enforced in the DB: own `swap_nominations` always readable; everyone's only once `current_phase in ('knockout_locked','complete')`. Reads go through `knockout_realloc_state()`; writes only through the definer RPCs.
- **Idempotent / rebuildable:** `resolve` clears prior `phase='knockout'` rows first; scores recompute from scratch after.
- **Wildcard is a replacement:** old active picks → `is_active=false` + `superseded_by`; `profiles.wildcard_used_at` enforces one-time.

## Verification

1. `npm test` (knockoutView + updated scoring), `npx tsc --noEmit`, `npm run build`.
2. User applies `0030` in Supabase, then runs `supabase/tests/0030_knockout_realloc_simulation.sql` (expects `KNOCKOUT REALLOC SIMULATION PASSED`, rolls back).
3. In-app: admin opens the window; managers submit a blind swap + wildcard; admin resolves; confirm results reveal and scores recompute with knockout points routed to new owners and group points unchanged.
