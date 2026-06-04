# Draft-Night Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make draft night feel like an event by wrapping the existing team-selection board with an "on the clock" turn banner, a snake draft-order rail, and "my picks" slots.

**Architecture:** Pure presentational frontend only — no migrations, no RPC changes. Everything renders from the data the existing `draft_state()` RPC already returns. New view-layer math lives in a pure, unit-tested `lib/draftView.ts` (mirrors the pattern of `lib/draft.ts`). Three new server components consume those helpers and are composed into `app/(app)/home/page.tsx` only when `phase === 'draft'`. The draft stays **blind** — no board changes.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript (strict), Tailwind (custom theme: `gold`, `navy`, `panel`, `glow`, `caption`, `bodytext`), Vitest for unit tests.

---

## Background the engineer needs

- `draft_state()` (in `supabase/migrations/0005_draft.sql`) returns a JSON object typed as `DraftState` in `components/draft/DraftStatus.tsx`. Relevant fields:
  - `phase` — one of `registration | draft | group_locked | knockout_realloc | knockout_locked | complete`.
  - `is_my_turn: boolean`, `current_user_name: string | null`.
  - `picks_made: number` (group-phase picks committed so far), `picks_total: number` (= players × teams_per_player).
  - `order_names: string[]` — display names in draft (pick) order, index 0 picks first.
  - `my_team_ids: string[]` — the caller's drafted team ids (in pick order).
  - `board: BoardTeam[]` — every team; each has `{ id, name, group_letter, flag_url, taken, owner_name }`. `owner_name` is `null` while `phase === 'draft'` (blind).
- Player count during the draft is `order_names.length`. Teams-per-player is `picks_total / order_names.length`.
- The snake order math already exists and is SQL-mirrored: `lib/draft.ts` exports `playerIndexForPick(pickIndex, playerCount)` (0-based; even rounds forward, odd reverse) and `snakeRoundForPick(pickIndex, playerCount)` (1-based round). **Reuse `playerIndexForPick` — do not re-derive the snake.**
- Custom Tailwind theme colors already in use across `components/draft/*`: `text-gold`, `bg-gold`, `text-navy`, `bg-panel`, `border-gold`, `border-glow`, `text-caption`, `text-bodytext`, `text-white`. Use these — do not invent new colors.
- Tests run with `npm test` (Vitest). Existing example: `lib/draft.test.ts`. There is **no** React component-test setup; components are verified via `npm run build`, `npm run lint`, and a visual check on `npm run dev`.

---

## File Structure

**Create:**
- `lib/draftView.ts` — pure view-layer helpers: `ordinal`, `turnContext`, `snakeRailForRound`, `myPickSlots`. No IO. One responsibility: turn `draft_state()` numbers into display-ready shapes.
- `lib/draftView.test.ts` — Vitest unit tests for the above.
- `components/draft/TurnBanner.tsx` — the "on the clock" / "waiting on X" banner (draft phase only).
- `components/draft/DraftOrderRail.tsx` — the snake-order pill rail (draft phase only).
- `components/draft/MyPicks.tsx` — the 3 roster slots filling up (draft phase only).

**Modify:**
- `components/draft/DraftStatus.tsx` — remove the now-superseded `draft` branch (TurnBanner replaces it); keep the `registration` and post-draft messages.
- `app/(app)/home/page.tsx` — compose the three new components during `phase === 'draft'`; render `DraftStatus` only when not drafting.

---

### Task 1: `ordinal` + `turnContext` view helpers

**Files:**
- Create: `lib/draftView.ts`
- Test: `lib/draftView.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/draftView.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ordinal, turnContext } from "@/lib/draftView";

describe("ordinal", () => {
  it("handles 1st, 2nd, 3rd, 4th", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
  });
  it("handles the 11–13 exception", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });
  it("handles 21st, 22nd, 23rd", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
  });
});

describe("turnContext (8 players, 3 teams each = 24 picks)", () => {
  it("pick 1 (picks_made 0) is round 1, your 1st team", () => {
    expect(turnContext(0, 24, 8)).toEqual({
      pickNumber: 1,
      picksTotal: 24,
      round: 1,
      teamOrdinal: "1st",
    });
  });
  it("pick 11 (picks_made 10) is round 2, your 2nd team", () => {
    expect(turnContext(10, 24, 8)).toEqual({
      pickNumber: 11,
      picksTotal: 24,
      round: 2,
      teamOrdinal: "2nd",
    });
  });
  it("the final pick (picks_made 23) is round 3, your 3rd team", () => {
    expect(turnContext(23, 24, 8)).toEqual({
      pickNumber: 24,
      picksTotal: 24,
      round: 3,
      teamOrdinal: "3rd",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- draftView`
Expected: FAIL — `Failed to resolve import "@/lib/draftView"` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/draftView.ts`:

```ts
// Pure view-layer helpers that turn draft_state() numbers into display-ready
// shapes. No IO. Snake math is reused from ./draft (SQL-mirrored) — never
// re-derived here.
import { playerIndexForPick } from "./draft";

/** English ordinal for a positive integer: 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface TurnContext {
  pickNumber: number; // 1-based number of the pick about to be made
  picksTotal: number;
  round: number; // 1-based snake round
  teamOrdinal: string; // which team this round is for the picker, e.g. "2nd"
}

/**
 * Context for the turn banner. In a snake draft each player picks once per
 * round, so the round number equals which team the current picker is choosing.
 */
export function turnContext(
  picksMade: number,
  picksTotal: number,
  playerCount: number
): TurnContext {
  const round = Math.floor(picksMade / playerCount) + 1;
  return {
    pickNumber: picksMade + 1,
    picksTotal,
    round,
    teamOrdinal: ordinal(round),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- draftView`
Expected: PASS (9 assertions across `ordinal` and `turnContext`).

- [ ] **Step 5: Commit**

```bash
git add lib/draftView.ts lib/draftView.test.ts
git commit -m "feat: ordinal + turnContext draft view helpers"
```

---

### Task 2: `snakeRailForRound` view helper

**Files:**
- Modify: `lib/draftView.ts`
- Test: `lib/draftView.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/draftView.test.ts`:

```ts
import { snakeRailForRound } from "@/lib/draftView";

describe("snakeRailForRound (4 players: A B C D)", () => {
  const names = ["A", "B", "C", "D"];

  it("round 1, nobody picked yet: forward order, A on the clock, B next", () => {
    expect(snakeRailForRound(names, 0, 4)).toEqual({
      round: 1,
      entries: [
        { name: "A", status: "now" },
        { name: "B", status: "next" },
        { name: "C", status: "upcoming" },
        { name: "D", status: "upcoming" },
      ],
    });
  });

  it("round 1, two picked: A,B done, C now, D next", () => {
    expect(snakeRailForRound(names, 2, 4)).toEqual({
      round: 1,
      entries: [
        { name: "A", status: "done" },
        { name: "B", status: "done" },
        { name: "C", status: "now" },
        { name: "D", status: "next" },
      ],
    });
  });

  it("round 1, last picker on the clock: no 'next' (snake turns around)", () => {
    expect(snakeRailForRound(names, 3, 4)).toEqual({
      round: 1,
      entries: [
        { name: "A", status: "done" },
        { name: "B", status: "done" },
        { name: "C", status: "done" },
        { name: "D", status: "now" },
      ],
    });
  });

  it("round 2 reverses: visual order D C B A, D on the clock", () => {
    expect(snakeRailForRound(names, 4, 4)).toEqual({
      round: 2,
      entries: [
        { name: "D", status: "now" },
        { name: "C", status: "next" },
        { name: "B", status: "upcoming" },
        { name: "A", status: "upcoming" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- draftView`
Expected: FAIL — `snakeRailForRound is not a function` / import has no such export.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/draftView.ts`:

```ts
export type RailStatus = "done" | "now" | "next" | "upcoming";

export interface RailEntry {
  name: string;
  status: RailStatus;
}

export interface DraftRail {
  round: number; // 1-based
  entries: RailEntry[]; // in visual snake order for the current round
}

/**
 * The current round's pick order as display-ready pills. Entries are in visual
 * snake order (forward on even rounds, reversed on odd) so players watch the
 * order turn around at the ends. When the last picker of a round is on the
 * clock, no entry is 'next' — the snake turns around to that same player, which
 * a single rail can't meaningfully mark.
 */
export function snakeRailForRound(
  orderNames: string[],
  picksMade: number,
  playerCount: number
): DraftRail {
  const round0 = Math.floor(picksMade / playerCount); // 0-based round
  const positionInRound = picksMade % playerCount; // 0-based seat of current picker
  const entries: RailEntry[] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    const playerIdx = playerIndexForPick(round0 * playerCount + seat, playerCount);
    let status: RailStatus;
    if (seat < positionInRound) status = "done";
    else if (seat === positionInRound) status = "now";
    else if (seat === positionInRound + 1) status = "next";
    else status = "upcoming";
    entries.push({ name: orderNames[playerIdx], status });
  }
  return { round: round0 + 1, entries };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- draftView`
Expected: PASS (all Task 1 + Task 2 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/draftView.ts lib/draftView.test.ts
git commit -m "feat: snakeRailForRound draft-order rail helper"
```

---

### Task 3: `myPickSlots` view helper

**Files:**
- Modify: `lib/draftView.ts`
- Test: `lib/draftView.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/draftView.test.ts`:

```ts
import { myPickSlots } from "@/lib/draftView";

const board = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "Japan", flag_url: "jp.png" },
  { id: "t3", name: "USA", flag_url: null },
];

describe("myPickSlots", () => {
  it("pads to slotCount with nulls when fewer picks made", () => {
    expect(myPickSlots(["t1"], board, 3)).toEqual([
      { name: "Argentina", flag_url: "ar.png" },
      null,
      null,
    ]);
  });

  it("maps each owned id to its board team in pick order", () => {
    expect(myPickSlots(["t2", "t1"], board, 3)).toEqual([
      { name: "Japan", flag_url: "jp.png" },
      { name: "Argentina", flag_url: "ar.png" },
      null,
    ]);
  });

  it("fills every slot when the roster is complete", () => {
    expect(myPickSlots(["t1", "t2", "t3"], board, 3)).toEqual([
      { name: "Argentina", flag_url: "ar.png" },
      { name: "Japan", flag_url: "jp.png" },
      { name: "USA", flag_url: null },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- draftView`
Expected: FAIL — `myPickSlots is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/draftView.ts`:

```ts
// Structural subset of board entries this helper needs — decouples lib/ from
// the BoardTeam type declared in components/.
interface BoardTeamLite {
  id: string;
  name: string;
  flag_url: string | null;
}

export interface PickSlot {
  name: string;
  flag_url: string | null;
}

/**
 * The caller's roster as a fixed-length array of `slotCount` slots: each owned
 * team (in pick order) mapped to its board entry, remaining slots `null`.
 */
export function myPickSlots(
  myTeamIds: string[],
  board: BoardTeamLite[],
  slotCount: number
): (PickSlot | null)[] {
  const byId = new Map(board.map((t) => [t.id, t]));
  const slots: (PickSlot | null)[] = [];
  for (let i = 0; i < slotCount; i++) {
    const id = myTeamIds[i];
    const team = id ? byId.get(id) : undefined;
    slots.push(team ? { name: team.name, flag_url: team.flag_url } : null);
  }
  return slots;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- draftView`
Expected: PASS (all `draftView` cases).

- [ ] **Step 5: Commit**

```bash
git add lib/draftView.ts lib/draftView.test.ts
git commit -m "feat: myPickSlots draft roster-slot helper"
```

---

### Task 4: `TurnBanner` component

**Files:**
- Create: `components/draft/TurnBanner.tsx`

- [ ] **Step 1: Write the component**

Create `components/draft/TurnBanner.tsx`:

```tsx
import { turnContext } from "@/lib/draftView";

// The "on the clock" banner shown during phase === 'draft'. Replaces the bare
// status line. Pure presentational; all data comes from draft_state().
export default function TurnBanner({
  isMyTurn,
  currentUserName,
  picksMade,
  picksTotal,
  playerCount,
}: {
  isMyTurn: boolean;
  currentUserName: string | null;
  picksMade: number;
  picksTotal: number;
  playerCount: number;
}) {
  const ctx = turnContext(picksMade, picksTotal, playerCount);
  const subline = `Pick ${ctx.pickNumber} of ${ctx.picksTotal} · Round ${ctx.round} · pick your ${ctx.teamOrdinal} team`;

  if (isMyTurn) {
    return (
      <div className="rounded-xl border border-gold bg-gradient-to-b from-[#1a2350] to-panel p-4 text-center">
        <p className="text-lg font-black uppercase tracking-wide text-gold">
          ⏰ You&apos;re on the clock
        </p>
        <p className="mt-1 text-xs text-bodytext">{subline}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glow bg-panel p-4 text-center">
      <p className="text-base font-bold">
        Waiting on <span className="text-white">{currentUserName ?? "the current player"}</span>…
      </p>
      <p className="mt-1 text-xs text-caption">{subline}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint`
Expected: PASS — no errors for `components/draft/TurnBanner.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/draft/TurnBanner.tsx
git commit -m "feat: TurnBanner draft on-the-clock component"
```

---

### Task 5: `DraftOrderRail` component

**Files:**
- Create: `components/draft/DraftOrderRail.tsx`

- [ ] **Step 1: Write the component**

Create `components/draft/DraftOrderRail.tsx`:

```tsx
import { snakeRailForRound, type RailStatus } from "@/lib/draftView";

// Horizontal snake-order pills for the current round. Pure presentational.
const PILL: Record<RailStatus, string> = {
  done: "border-glow bg-panel text-caption opacity-50",
  now: "border-gold bg-gold font-bold text-navy",
  next: "border-gold text-gold",
  upcoming: "border-glow bg-panel text-bodytext",
};

export default function DraftOrderRail({
  orderNames,
  picksMade,
  playerCount,
}: {
  orderNames: string[];
  picksMade: number;
  playerCount: number;
}) {
  const { round, entries } = snakeRailForRound(orderNames, picksMade, playerCount);

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-caption">
        Draft order · Round {round}
      </h2>
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => (
          <span
            key={`${e.name}-${i}`}
            className={`rounded-full border px-3 py-1 text-xs ${PILL[e.status]}`}
          >
            {e.name}
            {e.status === "next" && " ▸"}
          </span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint`
Expected: PASS — no errors for `components/draft/DraftOrderRail.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/draft/DraftOrderRail.tsx
git commit -m "feat: DraftOrderRail snake-order pill component"
```

---

### Task 6: `MyPicks` component

**Files:**
- Create: `components/draft/MyPicks.tsx`

- [ ] **Step 1: Write the component**

Create `components/draft/MyPicks.tsx`:

```tsx
import { myPickSlots } from "@/lib/draftView";
import type { BoardTeam } from "./DraftStatus";

// The caller's roster filling up during the draft. The first empty slot is
// highlighted as "pick now" when it's the caller's turn. Pure presentational.
export default function MyPicks({
  myTeamIds,
  board,
  slotCount,
  isMyTurn,
}: {
  myTeamIds: string[];
  board: BoardTeam[];
  slotCount: number;
  isMyTurn: boolean;
}) {
  const slots = myPickSlots(myTeamIds, board, slotCount);
  const filled = myTeamIds.length;

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-caption">
        My picks ({filled} / {slotCount})
      </h2>
      <div className="flex gap-2">
        {slots.map((slot, i) => {
          const isNextToPick = isMyTurn && i === filled;
          if (slot) {
            return (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-gold bg-panel p-3 text-center"
              >
                {slot.flag_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={slot.flag_url} alt="" className="h-5 w-8 rounded-sm object-cover" />
                )}
                <span className="text-[11px] text-white">{slot.name}</span>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={[
                "flex flex-1 items-center justify-center rounded-lg border border-dashed p-3 text-center text-[11px]",
                isNextToPick ? "border-gold text-gold" : "border-glow text-caption",
              ].join(" ")}
            >
              {isNextToPick ? "pick now" : "—"}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint`
Expected: PASS — no errors for `components/draft/MyPicks.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/draft/MyPicks.tsx
git commit -m "feat: MyPicks draft roster-slots component"
```

---

### Task 7: Wire into the home dashboard + simplify DraftStatus

**Files:**
- Modify: `components/draft/DraftStatus.tsx` (remove the `draft` branch)
- Modify: `app/(app)/home/page.tsx` (compose the three new components for `phase === 'draft'`)

- [ ] **Step 1: Remove the superseded `draft` branch from DraftStatus**

In `components/draft/DraftStatus.tsx`, delete the entire `if (phase === "draft") { … }` block (the middle branch returning the "It's YOUR turn / Waiting on …" line). Keep the `registration` branch and the final post-draft return. After editing, the function body is:

```tsx
export default function DraftStatus({ state }: { state: DraftState }) {
  const { phase, picks_total } = state;

  if (phase === "registration") {
    return (
      <p className="text-bodytext">
        The draft hasn&apos;t started yet. Once the admin opens it, come back here to pick.
      </p>
    );
  }

  // group_locked and beyond
  return (
    <p className="text-lg font-bold text-gold">
      Draft complete — all {picks_total} picks are in. Rosters revealed below.
    </p>
  );
}
```

(Leave the `BoardTeam`, `Roster`, and `DraftState` interface exports at the top of the file unchanged — other files import them.)

- [ ] **Step 2: Compose the new components on the home page**

In `app/(app)/home/page.tsx`, add these imports beside the existing draft imports (after the `AdminControls` import on line 9):

```tsx
import TurnBanner from "@/components/draft/TurnBanner";
import DraftOrderRail from "@/components/draft/DraftOrderRail";
import MyPicks from "@/components/draft/MyPicks";
```

Then replace the single status line:

```tsx
      {state && <DraftStatus state={state} />}
```

with phase-aware rendering — the rich banner + rail + slots during the draft, the plain `DraftStatus` message otherwise:

```tsx
      {state && phase === "draft" ? (
        <>
          <TurnBanner
            isMyTurn={state.is_my_turn}
            currentUserName={state.current_user_name}
            picksMade={state.picks_made}
            picksTotal={state.picks_total}
            playerCount={state.order_names.length}
          />
          <DraftOrderRail
            orderNames={state.order_names}
            picksMade={state.picks_made}
            playerCount={state.order_names.length}
          />
          <MyPicks
            myTeamIds={state.my_team_ids}
            board={state.board}
            slotCount={state.picks_total / state.order_names.length}
            isMyTurn={state.is_my_turn}
          />
        </>
      ) : (
        state && <DraftStatus state={state} />
      )}
```

(The existing `DraftBoard` block below — rendered when `phase === "draft" || revealed` — is unchanged and still shows the tappable team grid + confirm bar beneath these new sections.)

- [ ] **Step 3: Run the unit tests**

Run: `npm test`
Expected: PASS — all existing tests plus the `draftView` suite; nothing broke.

- [ ] **Step 4: Build and lint**

Run: `npm run build` then `npm run lint`
Expected: both PASS with no type errors. (`state.order_names.length` and `state.picks_total` are already on the `DraftState` type.)

- [ ] **Step 5: Visual check on the dev server**

Run: `npm run dev`, log in as an admin, and from a `registration` state click **Start draft** (or reset with `supabase/dev/reset.sql` first to get a clean draft). Confirm on `/home`:
- When it's your turn: the gold **"⏰ You're on the clock"** banner with the round/team subline.
- When it's not: the **"Waiting on <name>…"** banner.
- The **Draft order · Round N** pill rail shows done (faded) / now (gold) / next (▸) / upcoming.
- **My picks (n / 3)** shows filled slots with flags and a highlighted "pick now" slot on your turn.
- The tappable board + confirm bar still work and the pick commits, advancing the turn.

- [ ] **Step 6: Commit**

```bash
git add components/draft/DraftStatus.tsx "app/(app)/home/page.tsx"
git commit -m "feat: draft-night dashboard — banner, order rail, my-picks on /home"
```

---

## Notes & non-goals

- **No backend changes.** This plan adds zero migrations and changes no RPC. If you find yourself editing SQL, stop — the data is already in `draft_state()`.
- **Draft stays blind.** Do not surface `owner_name` during `phase === 'draft'`; the board already hides it.
- **No undo.** Out of scope (admin-SQL recovery only), per the design spec.
- **Polling/refresh:** `/home` is already `force-dynamic`; a player sees the updated turn on their next load/navigation. Real-time auto-refresh (websockets/polling) is explicitly out of scope for Part 1.
