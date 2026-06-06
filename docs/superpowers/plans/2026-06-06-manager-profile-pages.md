# Manager Profile Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated `/managers/[id]` profile page — reached by tapping a manager's post-reveal roster card — showing their drafted roster, bonus predictions, and a hand-written summary blurb.

**Architecture:** A server component fetches profile + `draft_state()` + predictions, hands the raw data to a pure `buildManagerProfileView()` shaper (unit-tested), and renders a thin presentational `ManagerProfile` component. Visibility reuses existing RLS-safe paths: roster via the `draft_state()` security-definer RPC (post-reveal only), predictions via the `bonus_predictions` after-lock SELECT policy, summary via the world-readable `profiles` row.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript, Tailwind, Supabase (Postgres + RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-manager-profile-pages-design.md`

---

## File Structure

**Create**
- `supabase/migrations/0010_manager_summary.sql` — adds `profiles.summary` (DDL only).
- `lib/managerProfileView.ts` — pure view-model builder (`buildManagerProfileView`).
- `lib/managerProfileView.test.ts` — Vitest unit tests for the builder.
- `components/managers/ManagerProfile.tsx` — presentational profile component.
- `app/(app)/managers/[id]/page.tsx` — server component route.
- `supabase/seed/0011_seed_summaries.sql` — the blurb `update` statements (data; content written from final rosters + user-supplied facts).

**Modify**
- `middleware.ts` — add `/managers` to the `needsAuth` check.
- `components/draft/Rosters.tsx` — wrap each card in a link to `/managers/[id]`.
- `README.md` — add `0010`/`0011` to the apply-order list.

---

## Task 1: Migration — add `profiles.summary`

**Files:**
- Create: `supabase/migrations/0010_manager_summary.sql`

This is DDL the **user** applies in the Supabase SQL editor (the assistant has no DB
credentials). There is no automated test; verification is that the file is valid SQL and
self-contained.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0010_manager_summary.sql` with exactly:

```sql
-- ============================================================
-- 0010_manager_summary.sql
-- Adds a free-text "funny summary" blurb per manager, shown on /managers/[id].
--
-- Readable by all authenticated users via the existing `auth read profiles`
-- SELECT policy (0002_rls_policies.sql). No client write path is granted, so
-- summaries can only be set via the seed (0011), run in the SQL editor.
-- ============================================================

alter table profiles add column if not exists summary text;
```

- [ ] **Step 2: Sanity-check the SQL**

Re-read the file. Confirm: single `alter table` statement, `if not exists` guard (so a
re-run is harmless), no other side effects. There is nothing to execute locally.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_manager_summary.sql
git commit -m "feat: add profiles.summary column migration for manager blurbs"
```

---

## Task 2: Pure view-model builder + tests

**Files:**
- Create: `lib/managerProfileView.ts`
- Test: `lib/managerProfileView.test.ts`

Follow the existing `lib/draftView.ts` convention: pure functions, no IO, structural "lite"
types so `lib/` does not import from `components/`.

- [ ] **Step 1: Write the failing test**

Create `lib/managerProfileView.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { buildManagerProfileView, type ManagerProfileInput } from "@/lib/managerProfileView";

const board = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "Japan", flag_url: "jp.png" },
  { id: "t3", name: "USA", flag_url: null },
];

const categories = [
  { id: "c1", name: "Champion" },
  { id: "c2", name: "Top Scorer" },
  { id: "c3", name: "Wooden Spoon" },
];

function base(overrides: Partial<ManagerProfileInput> = {}): ManagerProfileInput {
  return {
    displayName: "W",
    summary: "A bold strategist.",
    isSelf: false,
    targetUserId: "u1",
    rosters: [{ user_id: "u1", team_ids: ["t2", "t1"] }],
    board,
    predictionsLockedAt: "2026-06-11T00:00:00Z",
    categories,
    predictions: [
      { category_id: "c1", pick_slot: 1, pick_value: "Brazil" },
      { category_id: "c2", pick_slot: 2, pick_value: "Mbappé" },
      { category_id: "c2", pick_slot: 1, pick_value: "Haaland" },
    ],
    ...overrides,
  };
}

describe("buildManagerProfileView — summary", () => {
  it("passes through a non-empty summary", () => {
    expect(buildManagerProfileView(base()).summary).toBe("A bold strategist.");
  });
  it("trims surrounding whitespace", () => {
    expect(buildManagerProfileView(base({ summary: "  hi  " })).summary).toBe("hi");
  });
  it("maps empty/whitespace/null summary to null", () => {
    expect(buildManagerProfileView(base({ summary: "   " })).summary).toBeNull();
    expect(buildManagerProfileView(base({ summary: "" })).summary).toBeNull();
    expect(buildManagerProfileView(base({ summary: null })).summary).toBeNull();
  });
});

describe("buildManagerProfileView — roster", () => {
  it("is hidden (empty teams) when rosters is null (pre-reveal)", () => {
    const v = buildManagerProfileView(base({ rosters: null }));
    expect(v.rosterVisible).toBe(false);
    expect(v.teams).toEqual([]);
  });
  it("maps the manager's team_ids to board entries in pick order", () => {
    const v = buildManagerProfileView(base());
    expect(v.rosterVisible).toBe(true);
    expect(v.teams).toEqual([
      { name: "Japan", flagUrl: "jp.png" },
      { name: "Argentina", flagUrl: "ar.png" },
    ]);
  });
  it("falls back to em dash for a team id missing from the board", () => {
    const v = buildManagerProfileView(base({ rosters: [{ user_id: "u1", team_ids: ["t9"] }] }));
    expect(v.teams).toEqual([{ name: "—", flagUrl: null }]);
  });
  it("yields empty teams when revealed but this manager has no roster row", () => {
    const v = buildManagerProfileView(base({ rosters: [{ user_id: "other", team_ids: ["t1"] }] }));
    expect(v.rosterVisible).toBe(true);
    expect(v.teams).toEqual([]);
  });
});

describe("buildManagerProfileView — predictions", () => {
  it("hides predictions when not locked and not self", () => {
    const v = buildManagerProfileView(base({ predictionsLockedAt: null, isSelf: false }));
    expect(v.predictionsVisible).toBe(false);
    expect(v.predictionsByCategory).toEqual([]);
  });
  it("shows predictions to self even before lock", () => {
    const v = buildManagerProfileView(base({ predictionsLockedAt: null, isSelf: true }));
    expect(v.predictionsVisible).toBe(true);
  });
  it("groups by category order and sorts picks by slot, dropping empty categories", () => {
    const v = buildManagerProfileView(base());
    expect(v.predictionsByCategory).toEqual([
      { categoryName: "Champion", picks: ["Brazil"] },
      { categoryName: "Top Scorer", picks: ["Haaland", "Mbappé"] },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/managerProfileView.test.ts`
Expected: FAIL — cannot resolve `@/lib/managerProfileView` (module/function not defined).

- [ ] **Step 3: Write the implementation**

Create `lib/managerProfileView.ts` with:

```ts
// Pure view-layer helpers for a manager's profile page. No IO. Shapes the
// already-fetched profile/roster/prediction data into a render-ready view model.
// Structural "lite" types decouple lib/ from the richer BoardTeam/Roster types
// declared in components/draft/DraftStatus.

interface RosterLite {
  user_id: string;
  team_ids: string[];
}

interface BoardTeamLite {
  id: string;
  name: string;
  flag_url: string | null;
}

interface CategoryLite {
  id: string;
  name: string;
}

interface PredictionLite {
  category_id: string;
  pick_slot: number;
  pick_value: string;
}

export interface ManagerProfileInput {
  displayName: string;
  summary: string | null;
  isSelf: boolean;
  targetUserId: string;
  rosters: RosterLite[] | null; // from draft_state(); null until the reveal
  board: BoardTeamLite[];
  predictionsLockedAt: string | null;
  categories: CategoryLite[]; // active categories, in display order
  predictions: PredictionLite[]; // this manager's active picks
}

export interface ProfileTeam {
  name: string;
  flagUrl: string | null;
}

export interface CategoryPicks {
  categoryName: string;
  picks: string[];
}

export interface ManagerProfileView {
  displayName: string;
  summary: string | null;
  isSelf: boolean;
  rosterVisible: boolean;
  teams: ProfileTeam[];
  predictionsVisible: boolean;
  predictionsByCategory: CategoryPicks[];
}

export function buildManagerProfileView(input: ManagerProfileInput): ManagerProfileView {
  const {
    displayName, summary, isSelf, targetUserId,
    rosters, board, predictionsLockedAt, categories, predictions,
  } = input;

  const trimmed = summary?.trim();
  const cleanSummary = trimmed ? trimmed : null;

  // Roster is revealed once draft_state() returns a (non-null) rosters array.
  const rosterVisible = rosters !== null;
  const byId = new Map(board.map((t) => [t.id, t]));
  const row = rosters?.find((r) => r.user_id === targetUserId) ?? null;
  const teams: ProfileTeam[] = row
    ? row.team_ids.map((id) => {
        const t = byId.get(id);
        return { name: t?.name ?? "—", flagUrl: t?.flag_url ?? null };
      })
    : [];

  // Others' predictions are visible only after the kickoff lock; your own always are.
  const predictionsVisible = predictionsLockedAt !== null || isSelf;
  const predictionsByCategory: CategoryPicks[] = predictionsVisible
    ? categories
        .map((cat) => ({
          categoryName: cat.name,
          picks: predictions
            .filter((p) => p.category_id === cat.id)
            .sort((a, b) => a.pick_slot - b.pick_slot)
            .map((p) => p.pick_value),
        }))
        .filter((c) => c.picks.length > 0)
    : [];

  return {
    displayName,
    summary: cleanSummary,
    isSelf,
    rosterVisible,
    teams,
    predictionsVisible,
    predictionsByCategory,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/managerProfileView.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/managerProfileView.ts lib/managerProfileView.test.ts
git commit -m "feat: add buildManagerProfileView pure view shaper with tests"
```

---

## Task 3: Presentational `ManagerProfile` component

**Files:**
- Create: `components/managers/ManagerProfile.tsx`

Presentational only (no IO, no unit test — verified by `npm run build`). Mirrors the styling of
`components/draft/Rosters.tsx` (flag `<img>` treatment) and uses `lib/ui` helpers.

- [ ] **Step 1: Write the component**

Create `components/managers/ManagerProfile.tsx` with:

```tsx
import type { ManagerProfileView } from "@/lib/managerProfileView";
import { pressableLink } from "@/lib/ui";

// One manager's public profile: blurb, roster, bonus predictions. Points are
// intentionally absent until the scoring subsystem exists.
export default function ManagerProfile({ view }: { view: ManagerProfileView }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <a href="/home" className={`self-start text-sm text-caption underline ${pressableLink}`}>
        ← Home
      </a>

      <header>
        <h1 className="text-2xl font-bold">
          {view.displayName}
          {view.isSelf && (
            <span className="ml-2 text-sm font-normal text-caption">(you)</span>
          )}
        </h1>
        {view.summary && (
          <p className="mt-2 whitespace-pre-line text-bodytext">{view.summary}</p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Roster</h2>
        {view.rosterVisible ? (
          <ul className="flex flex-col gap-1">
            {view.teams.map((t, i) => (
              <li key={`${t.name}-${i}`} className="flex items-center gap-2 text-sm text-white">
                {t.flagUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={t.flagUrl} alt="" className="h-4 w-6 rounded-sm object-cover" />
                )}
                <span>{t.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-bodytext">Roster hidden until the draft is revealed.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-caption">
          Bonus predictions
        </h2>
        {view.predictionsVisible ? (
          view.predictionsByCategory.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {view.predictionsByCategory.map((c) => (
                <li key={c.categoryName} className="text-sm">
                  <span className="text-caption">{c.categoryName}: </span>
                  <span className="text-white">{c.picks.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-bodytext">No predictions submitted.</p>
          )
        ) : (
          <p className="text-sm text-bodytext">Predictions hidden until kickoff lock.</p>
        )}
      </section>

      <p className="text-sm text-caption">Points will appear here once matches begin.</p>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add components/managers/ManagerProfile.tsx
git commit -m "feat: add ManagerProfile presentational component"
```

---

## Task 4: The `/managers/[id]` route + middleware gating

**Files:**
- Create: `app/(app)/managers/[id]/page.tsx`
- Modify: `middleware.ts`

- [ ] **Step 1: Gate `/managers` in middleware**

In `middleware.ts`, extend the `needsAuth` expression to include `/managers`. Replace:

```ts
  const needsAuth =
    pathname.startsWith("/home") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/admin");
```

with:

```ts
  const needsAuth =
    pathname.startsWith("/home") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/managers") ||
    pathname.startsWith("/admin");
```

- [ ] **Step 2: Write the route page**

Create `app/(app)/managers/[id]/page.tsx` with:

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildManagerProfileView } from "@/lib/managerProfileView";
import ManagerProfile from "@/components/managers/ManagerProfile";

export const dynamic = "force-dynamic"; // reflect live phase/lock state

export default async function ManagerPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: manager },
    { data: cfg },
    { data: draft },
    { data: categories },
    { data: predictions },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, summary").eq("id", params.id).single(),
    supabase.from("game_config").select("predictions_locked_at").eq("id", 1).single(),
    supabase.rpc("draft_state"),
    supabase.from("bonus_categories").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("bonus_predictions")
      .select("category_id, pick_slot, pick_value")
      .eq("user_id", params.id)
      .eq("is_active", true),
  ]);

  if (!manager) notFound();

  const state = (draft as DraftState | null) ?? null;
  const view = buildManagerProfileView({
    displayName: manager.display_name,
    summary: manager.summary ?? null,
    isSelf: user.id === params.id,
    targetUserId: params.id,
    rosters: state?.rosters ?? null,
    board: state?.board ?? [],
    predictionsLockedAt: cfg?.predictions_locked_at ?? null,
    categories: categories ?? [],
    predictions: predictions ?? [],
  });

  return <ManagerProfile view={view} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (If `manager.summary` raises a type error because Supabase types are
generated/strict, that means a generated `Database` type is in use and must be regenerated
after Task 1's column is applied — but this project uses the loosely-typed client, so no error
is expected.)

- [ ] **Step 4: Commit**

```bash
git add app/"(app)"/managers/"[id]"/page.tsx middleware.ts
git commit -m "feat: add /managers/[id] profile route, gated in middleware"
```

---

## Task 5: Make roster cards link to profiles

**Files:**
- Modify: `components/draft/Rosters.tsx`

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `components/draft/Rosters.tsx` with:

```tsx
import type { BoardTeam, Roster } from "./DraftStatus";
import { pressable } from "@/lib/ui";

// After group_locked: one card per manager with their teams, in pick order.
// Each card links to that manager's profile page.
export default function Rosters({
  rosters,
  board,
}: {
  rosters: Roster[];
  board: BoardTeam[];
}) {
  const byId = new Map(board.map((t) => [t.id, t]));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rosters.map((r) => (
        <a
          key={r.user_id}
          href={`/managers/${r.user_id}`}
          className={`block rounded-xl border border-glow bg-panel p-4 hover:border-gold ${pressable}`}
        >
          <h3 className="text-sm font-bold uppercase tracking-wide text-gold">
            {r.display_name}
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {r.team_ids.map((id) => {
              const t = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 text-sm text-white">
                  {t?.flag_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.flag_url} alt="" className="h-4 w-6 rounded-sm object-cover" />
                  )}
                  <span>{t?.name ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: type-check passes; all Vitest suites pass (existing 43 + the new
`managerProfileView` cases).

- [ ] **Step 3: Production build**

Run: `rm -rf .next && npm run build`
Expected: build succeeds; the route list now includes `/managers/[id]`.

- [ ] **Step 4: Commit**

```bash
git add components/draft/Rosters.tsx
git commit -m "feat: link roster cards to manager profile pages"
```

---

## Task 6: Document the apply order

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the new files to the apply-order list**

In `README.md`, in the numbered "Apply the SQL" list under **Core-app setup (Supabase)**, after
the existing item 10 (`0009_more_bonus_categories.sql`), add:

```markdown
   11. `supabase/migrations/0010_manager_summary.sql` — adds `profiles.summary` (the per-manager profile blurb shown on `/managers/[id]`).
   12. `supabase/seed/0011_seed_summaries.sql` — the manager summary blurbs (idempotent `update`s keyed by `display_name`). Apply any time after the draft.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add 0010/0011 to the SQL apply order"
```

---

## Task 7: Seed the summary blurbs (data — collaborative)

**Files:**
- Create: `supabase/seed/0011_seed_summaries.sql`

**Inputs required before writing the prose:** the **final rosters** (after the draft fully
reveals) and any **personal facts** the user supplies per manager. The nine `display_name`s are:
`Ho1328`, `tallon d'or`, `mzhong23`, `CravingDrumsticks`, `Hans`, `ryban3z`, `HST`, `Frimpong`,
`W`. The page renders a missing summary as "absent" (Task 3), so this task does not block the
rest of the feature and is done last.

**SQL escaping rule:** single quotes inside a value (and inside a `display_name`) must be
doubled. `tallon d'or` → `'tallon d''or'`; a blurb containing `don't` → `don''t`.

- [ ] **Step 1: Create the seed file with the header and one fully-written example**

Create `supabase/seed/0011_seed_summaries.sql`. Start with this exact header and the first
manager written out as the pattern to follow (replace the example prose once final rosters +
facts are in hand):

```sql
-- ============================================================
-- 0011_seed_summaries.sql
-- Per-manager "funny summary" blurbs shown on /managers/[id].
-- Idempotent: each statement overwrites by display_name, so re-running is safe.
-- Single quotes inside text must be doubled (e.g. don't -> don''t).
-- Plain text only; line breaks in the string are preserved on the page.
-- ============================================================

update profiles set summary =
  'Drafted Portugal first and never looked back — a man who backs flair over function. '
  'Owns a roster that screams "I''ll win the group stage and agonise in the Round of 16." '
  'Bold, slightly chaotic, exactly the energy this pool needs.'
  where display_name = 'ryban3z';
```

- [ ] **Step 2: Add the remaining eight `update` statements**

Append one `update profiles set summary = '…' where display_name = '…';` per remaining manager
(`Ho1328`, `tallon d'or`, `mzhong23`, `CravingDrumsticks`, `Hans`, `HST`, `Frimpong`, `W`),
each blurb written from that manager's final roster plus any facts supplied. Remember to escape
`'tallon d''or'`. Each blurb: 1–3 short sentences covering their picks, their chances, and what
it says about them.

- [ ] **Step 3: Sanity-check the SQL**

Re-read the file. Confirm: nine `update` statements, every `display_name` matches the list
exactly, all single quotes doubled, every statement terminated with `;`. There is nothing to
execute locally — the user runs it in the SQL editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed/0011_seed_summaries.sql
git commit -m "feat: add manager summary blurb seed (0011)"
```

---

## Final verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm test` — all suites pass.
- [ ] `rm -rf .next && npm run build` — succeeds; `/managers/[id]` appears in the route list.
- [ ] Hand the user the apply list: run `0010_manager_summary.sql`, then (when ready)
  `0011_seed_summaries.sql`, in the Supabase SQL editor.
