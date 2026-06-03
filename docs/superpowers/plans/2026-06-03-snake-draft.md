# Snake Draft (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the group-stage snake draft: an admin opens it, players pick 3 teams each in snake order (blind to others' picks during the draft), and the moment the last pick lands the whole thing auto-reveals to everyone.

**Architecture:** The draft engine is four Postgres `security definer` functions called by RPC from Next.js server actions, so every rule (one owner per team, exactly 3 per player, turn order, the reveal) holds atomically in the database and can't be raced or bypassed from the client. `team_ownership` stays directly unreadable; `draft_state()` is the only read window, enforcing blind-during / reveal-after in the DB. The `/draft` page renders whatever `draft_state()` returns; admin controls live on the same page.

**Tech Stack:** Next.js 14.2 App Router (Server Components + Server Actions), Supabase Postgres + RLS, `@supabase/ssr` server client, Vitest for the pure snake-order helper, Tailwind (gold-on-navy theme).

---

## Background the engineer needs

**Schema already exists** (`supabase/migrations/0001_initial_schema.sql`). The relevant pieces:

- `game_config` (single row, `id = 1`): `current_phase game_phase`, `draft_order uuid[]`, `draft_current_user_id uuid`, `draft_turn_started_at timestamptz`, `teams_per_player int default 3`, `registration_open boolean`.
- `game_phase` enum: `registration → draft → group_locked → knockout_realloc → knockout_locked → complete`.
- `team_ownership`: `(user_id, team_id, phase owner_phase, pick_order int, snake_round int, acquired_via)` with `unique (team_id, phase)`. The draft writes rows at `phase = 'group'`, `acquired_via = 'draft'`.
- `teams`: 48 rows seeded with `name`, `group_letter` ('A'..'L'), `flag_url`. RLS lets any authenticated user read `teams` and `game_config`.
- `profiles`: `id`, `display_name`, `is_admin`. Any authenticated user can read all profiles.

**RLS today** (`0002_rls_policies.sql`): deny-by-default everywhere. `team_ownership` has RLS enabled with **no select policy**, so it is not directly readable by clients — exactly what we want. `security definer` functions run as the function owner and bypass RLS, so `draft_state()` can read `team_ownership` and return only what the current phase permits. **Do not add a select policy to `team_ownership`** — `draft_state()` is the only window.

**Existing conventions to copy:**
- Security-definer RPC pattern: see `is_registration_open()` in `0004_registration_open.sql` (`language sql security definer set search_path = public`, then `grant execute ... to ...`).
- Server client: `import { createClient } from "@/lib/supabase/server"` (already wraps cookies).
- Server actions live next to their route as `actions.ts` with `"use server"` at the top; they `redirect()` from `next/navigation`. See `app/(auth)/actions.ts`.
- Tests: Vitest, `import { describe, it, expect } from "vitest"`, `@/` path alias works. See `lib/identity.test.ts`. Run a single file with `npx vitest run lib/draft.test.ts`.
- Migrations are applied by hand in the Supabase SQL editor (see `README.md`). Numbering continues from `0004`; the next file is `0005`.

**Snake order (canonical):** With `N` players and 3 rounds, total picks `= N × 3`. Number picks 0-based, `k = 0 … N×3−1`. Round `r = floor(k / N)` (0,1,2). Position in round `pos = k mod N`. Rounds 0 and 2 go **forward** through `draft_order` (`playerIndex = pos`); round 1 goes **reverse** (`playerIndex = N−1−pos`). 1-based `snake_round = r + 1`. This same math lives in both the TS helper (Task 1) and the SQL helper (Task 2) — they must agree.

---

## File structure

- `lib/draft.ts` — pure snake-order math (no IO). Source of truth for turn order, mirrored in SQL.
- `lib/draft.test.ts` — Vitest unit tests for the helper.
- `supabase/migrations/0005_draft.sql` — the four engine functions + an internal helper + grants.
- `supabase/tests/0005_draft_simulation.sql` — a runnable end-to-end simulation that asserts the invariants (run in the Supabase SQL editor).
- `app/(app)/draft/actions.ts` — server actions: `startDraft`, `makePick`, `adminAutopick`.
- `app/(app)/draft/page.tsx` — the `/draft` server component (fetches `draft_state()`, branches on phase).
- `components/draft/DraftStatus.tsx` — status line + progress (server component).
- `components/draft/DraftBoard.tsx` — the 48-team board grouped A–L; **client** component (tap → confirm → pick).
- `components/draft/Rosters.tsx` — revealed rosters after `group_locked` (server component).
- `components/draft/AdminControls.tsx` — admin-only Start / Auto-pick forms (server component).
- `middleware.ts` — extend the auth gate to cover `/draft`.
- `app/(app)/home/page.tsx` — add a gold "Go to the draft" link once the phase has left `registration`.
- `README.md` — note how to apply `0005` and run the simulation.

---

## Task 1: Snake-order helper (pure, TDD)

**Files:**
- Create: `lib/draft.ts`
- Test: `lib/draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { playerIndexForPick, snakeRoundForPick } from "@/lib/draft";

describe("playerIndexForPick (8 players, 3 rounds)", () => {
  const N = 8;
  it("round 1 (picks 0–7) runs forward 0→7", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => playerIndexForPick(k, N))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
  it("round 2 (picks 8–15) runs reverse 7→0", () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((k) => playerIndexForPick(k, N))).toEqual([
      7, 6, 5, 4, 3, 2, 1, 0,
    ]);
  });
  it("round 3 (picks 16–23) runs forward 0→7", () => {
    expect([16, 17, 18, 19, 20, 21, 22, 23].map((k) => playerIndexForPick(k, N))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe("playerIndexForPick (2 players)", () => {
  it("snakes 0,1,1,0,0,1", () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => playerIndexForPick(k, 2))).toEqual([
      0, 1, 1, 0, 0, 1,
    ]);
  });
});

describe("snakeRoundForPick (8 players)", () => {
  it("is 1-based and changes every N picks", () => {
    expect(snakeRoundForPick(0, 8)).toBe(1);
    expect(snakeRoundForPick(7, 8)).toBe(1);
    expect(snakeRoundForPick(8, 8)).toBe(2);
    expect(snakeRoundForPick(15, 8)).toBe(2);
    expect(snakeRoundForPick(16, 8)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/draft.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/draft"` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/draft.ts`:

```ts
// Canonical snake-draft order math. Pure, no IO. This is mirrored exactly by the
// SQL helper `_draft_player_at` in supabase/migrations/0005_draft.sql — keep them
// in sync. Picks are numbered 0-based: k = 0 … (playerCount * teamsPerPlayer) - 1.

/** 0-based index into `draft_order` of the player who makes pick `pickIndex`. */
export function playerIndexForPick(pickIndex: number, playerCount: number): number {
  const round = Math.floor(pickIndex / playerCount);
  const pos = pickIndex % playerCount;
  // Even rounds (0-based) run forward; odd rounds run reverse — that's the snake.
  return round % 2 === 0 ? pos : playerCount - 1 - pos;
}

/** 1-based round number (1, 2, 3, …) for pick `pickIndex`. */
export function snakeRoundForPick(pickIndex: number, playerCount: number): number {
  return Math.floor(pickIndex / playerCount) + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/draft.test.ts`
Expected: PASS (all 5 tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/draft.ts lib/draft.test.ts
git commit -m "feat(draft): pure snake-order helper with tests"
```

---

## Task 2: Draft engine migration (SQL security-definer functions)

**Files:**
- Create: `supabase/migrations/0005_draft.sql`

This file defines one internal helper and four public functions. The internal `_apply_pick` is shared by `make_pick` and `admin_autopick` so the insert/advance/reveal logic exists once.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_draft.sql`:

```sql
-- ============================================================
-- Snake draft engine (Plan 2). All rules enforced server-side in
-- security-definer functions so they hold atomically and cannot be
-- bypassed from the client. team_ownership stays directly unreadable;
-- draft_state() is the only read window (blind-during / reveal-after).
-- Canonical design: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ---------- internal: who picks at a given 0-based pick index ----------
-- Mirrors lib/draft.ts playerIndexForPick. Even rounds forward, odd reverse.
create or replace function public._draft_player_at(p_order uuid[], p_pick int)
returns uuid
language plpgsql
immutable
as $$
declare
  n     int := array_length(p_order, 1);
  rnd   int := p_pick / n;     -- integer division, 0-based round
  pos   int := p_pick % n;
begin
  if n is null or n = 0 then
    return null;
  end if;
  if rnd % 2 = 1 then
    pos := n - 1 - pos;        -- reverse on odd rounds
  end if;
  return p_order[pos + 1];     -- Postgres arrays are 1-based
end;
$$;

-- ---------- internal: insert one pick, advance the turn, auto-reveal ----------
-- Assumes the caller has already validated phase, turn ownership, and team
-- availability. Writes the team_ownership row for p_user, then either advances
-- draft_current_user_id to the next snake picker or, on the final pick, flips
-- current_phase to 'group_locked' (the reveal) and clears the current picker.
create or replace function public._apply_pick(p_user uuid, p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order uuid[];
  v_tpp   int;
  v_made  int;      -- picks already made before this one
  v_total int;
begin
  select draft_order, teams_per_player into v_order, v_tpp
    from game_config where id = 1;

  v_made  := (select count(*) from team_ownership where phase = 'group');
  v_total := array_length(v_order, 1) * v_tpp;

  insert into team_ownership (user_id, team_id, phase, pick_order, snake_round, acquired_via)
  values (
    p_user,
    p_team,
    'group',
    v_made + 1,                         -- 1-based overall pick number
    (v_made / array_length(v_order, 1)) + 1,  -- 1-based snake round
    'draft'
  );

  if v_made + 1 >= v_total then
    -- Final pick: auto-reveal.
    update game_config
       set current_phase = 'group_locked',
           draft_current_user_id = null,
           draft_turn_started_at = null,
           updated_at = now()
     where id = 1;
  else
    update game_config
       set draft_current_user_id = public._draft_player_at(v_order, v_made + 1),
           draft_turn_started_at = now(),
           updated_at = now()
     where id = 1;
  end if;
end;
$$;

-- ---------- start_draft(): admin opens the draft ----------
create or replace function public.start_draft()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order  uuid[];
  v_tpp    int;
  v_teams  int;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can start the draft';
  end if;
  if (select current_phase from game_config where id = 1) <> 'registration' then
    raise exception 'draft can only be started from the registration phase';
  end if;

  select array_agg(id order by random()) into v_order from profiles;
  if v_order is null or array_length(v_order, 1) < 2 then
    raise exception 'need at least 2 registered players to start the draft';
  end if;

  select teams_per_player into v_tpp from game_config where id = 1;
  select count(*) into v_teams from teams;
  if array_length(v_order, 1) * v_tpp > v_teams then
    raise exception 'not enough teams (%) for % players x % picks', v_teams, array_length(v_order, 1), v_tpp;
  end if;

  update game_config
     set draft_order = v_order,
         current_phase = 'draft',
         draft_current_user_id = public._draft_player_at(v_order, 0),
         draft_turn_started_at = now(),
         registration_open = false,
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- make_pick(team_id): the current player drafts a team ----------
create or replace function public.make_pick(p_team_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if (select current_phase from game_config where id = 1) <> 'draft' then
    raise exception 'the draft is not currently open';
  end if;
  if (select draft_current_user_id from game_config where id = 1) <> auth.uid() then
    raise exception 'it is not your turn';
  end if;
  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'no such team';
  end if;
  if exists (select 1 from team_ownership where team_id = p_team_id and phase = 'group') then
    raise exception 'that team is already taken';
  end if;

  perform public._apply_pick(auth.uid(), p_team_id);
end;
$$;

-- ---------- admin_autopick(): admin assigns a random available team to the current player ----------
create or replace function public.admin_autopick()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_current uuid;
  v_team    uuid;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can auto-pick';
  end if;
  if (select current_phase from game_config where id = 1) <> 'draft' then
    raise exception 'the draft is not currently open';
  end if;

  select draft_current_user_id into v_current from game_config where id = 1;
  if v_current is null then
    raise exception 'no current picker';
  end if;

  select t.id into v_team
    from teams t
   where not exists (
     select 1 from team_ownership o where o.team_id = t.id and o.phase = 'group'
   )
   order by random()
   limit 1;
  if v_team is null then
    raise exception 'no available teams left';
  end if;

  perform public._apply_pick(v_current, v_team);
end;
$$;

-- ---------- draft_state(): the single authenticated read window ----------
-- Returns phase, whose turn, progress, the 48-team board, the caller's own
-- picks, and (only once revealed) full rosters. Owners on the board are hidden
-- while current_phase = 'draft'. SECURITY DEFINER bypasses RLS, so this is the
-- only way clients see team_ownership — blind-during / reveal-after lives here.
create or replace function public.draft_state()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_uid      uuid := auth.uid();
  v_phase    game_phase;
  v_order    uuid[];
  v_current  uuid;
  v_tpp      int;
  v_revealed boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select current_phase, draft_order, draft_current_user_id, teams_per_player
    into v_phase, v_order, v_current, v_tpp
    from game_config where id = 1;

  -- Revealed once the draft is over (group_locked and every phase after it).
  v_revealed := v_phase not in ('registration', 'draft');

  return jsonb_build_object(
    'phase', v_phase,
    'is_admin', coalesce((select is_admin from profiles where id = v_uid), false),
    'current_user_id', v_current,
    'current_user_name', (select display_name from profiles where id = v_current),
    'is_my_turn', (v_current = v_uid),
    'picks_made', (select count(*) from team_ownership where phase = 'group'),
    'picks_total', coalesce(array_length(v_order, 1), 0) * v_tpp,
    'order_names', (
      select coalesce(jsonb_agg(p.display_name order by ord.idx), '[]'::jsonb)
        from unnest(v_order) with ordinality as ord(uid, idx)
        join profiles p on p.id = ord.uid
    ),
    'my_team_ids', (
      select coalesce(jsonb_agg(o.team_id), '[]'::jsonb)
        from team_ownership o
       where o.phase = 'group' and o.user_id = v_uid
    ),
    'board', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'group_letter', t.group_letter,
          'flag_url', t.flag_url,
          'taken', (o.team_id is not null),
          'owner_name', case when v_revealed then own.display_name else null end
        ) order by t.group_letter, t.name
      ), '[]'::jsonb)
      from teams t
      left join team_ownership o on o.team_id = t.id and o.phase = 'group'
      left join profiles own on own.id = o.user_id
    ),
    'rosters', case when v_revealed then (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'display_name', p.display_name,
          'team_ids', coalesce((
            select jsonb_agg(o2.team_id order by o2.pick_order)
              from team_ownership o2
             where o2.user_id = p.id and o2.phase = 'group'
          ), '[]'::jsonb)
        ) order by p.display_name
      ), '[]'::jsonb)
      from profiles p
      where exists (
        select 1 from team_ownership o3 where o3.user_id = p.id and o3.phase = 'group'
      )
    ) else null end
  );
end;
$$;

-- ---------- grants ----------
grant execute on function public.start_draft()      to authenticated;
grant execute on function public.make_pick(uuid)    to authenticated;
grant execute on function public.admin_autopick()   to authenticated;
grant execute on function public.draft_state()      to authenticated;
-- _draft_player_at and _apply_pick are internal: no grant (callable only from
-- the definer functions above, which run as owner).
```

- [ ] **Step 2: Apply the migration in Supabase**

Open the Supabase project → SQL editor → paste the full contents of `supabase/migrations/0005_draft.sql` → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Smoke-check the functions exist**

In the SQL editor, run:

```sql
select proname from pg_proc
where proname in ('start_draft','make_pick','admin_autopick','draft_state','_apply_pick','_draft_player_at')
order by proname;
```

Expected: 6 rows (`_apply_pick`, `_draft_player_at`, `admin_autopick`, `draft_state`, `make_pick`, `start_draft`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_draft.sql
git commit -m "feat(draft): security-definer draft engine (start/pick/autopick/state)"
```

---

## Task 3: End-to-end draft simulation (SQL assertion script)

The engine can't be unit-tested in this repo (no pg harness), so verify it with a runnable simulation that drives a full draft via the same functions and asserts the invariants. It seeds throwaway players, runs every pick by impersonating the current picker, and checks: each player ends with exactly `teams_per_player` teams, all picks are distinct, and the phase auto-flipped to `group_locked`. It rolls everything back so it leaves no residue.

**Files:**
- Create: `supabase/tests/0005_draft_simulation.sql`

- [ ] **Step 1: Write the simulation**

Create `supabase/tests/0005_draft_simulation.sql`:

```sql
-- Runnable verification for the draft engine (Plan 2). Paste into the Supabase
-- SQL editor and Run. It creates throwaway players, runs a complete draft by
-- impersonating each current picker (set request.jwt.claim.sub = their id), and
-- asserts the invariants, then ROLLS BACK so nothing is persisted.
--
-- Expected final output: a single NOTICE "DRAFT SIMULATION PASSED", and because
-- of the ROLLBACK at the end, no rows are committed. If any assertion fails the
-- block raises an exception and the transaction aborts.

begin;

do $$
declare
  v_ids     uuid[] := '{}';
  v_id      uuid;
  v_i       int;
  v_n       int := 4;          -- simulate 4 players
  v_tpp     int;
  v_total   int;
  v_current uuid;
  v_team    uuid;
  v_phase   game_phase;
  v_minpick int;
  v_maxpick int;
  v_distinct int;
begin
  -- Make admin checks pass for whoever we impersonate: create players directly
  -- in profiles (bypassing auth.users is fine inside this rolled-back tx because
  -- we only call the draft functions, which read profiles/game_config).
  -- NOTE: profiles.id references auth.users(id); to satisfy the FK we insert
  -- matching auth.users rows too, then clean up via ROLLBACK.
  for v_i in 1..v_n loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email)
      values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'sim-' || v_i || '@sim.local');
    insert into profiles (id, display_name, is_admin)
      values (v_id, 'Sim Player ' || v_i, true);   -- admin so start_draft passes
    v_ids := v_ids || v_id;
  end loop;

  -- Reset config to a clean registration state for the sim.
  update game_config
     set current_phase = 'registration',
         draft_order = '{}',
         draft_current_user_id = null,
         teams_per_player = 3
   where id = 1;

  -- Impersonate player 1 (an admin) and start the draft.
  perform set_config('request.jwt.claim.sub', v_ids[1]::text, true);
  perform public.start_draft();

  select teams_per_player into v_tpp from game_config where id = 1;
  v_total := v_n * v_tpp;

  -- Run every pick: impersonate the current picker, pick first available team.
  for v_i in 1..v_total loop
    select draft_current_user_id into v_current from game_config where id = 1;
    if v_current is null then
      raise exception 'current picker went null at pick % of %', v_i, v_total;
    end if;
    perform set_config('request.jwt.claim.sub', v_current::text, true);
    select t.id into v_team
      from teams t
     where not exists (select 1 from team_ownership o where o.team_id = t.id and o.phase = 'group')
     order by t.name
     limit 1;
    perform public.make_pick(v_team);
  end loop;

  -- Assertions ----------------------------------------------------------
  select current_phase into v_phase from game_config where id = 1;
  if v_phase <> 'group_locked' then
    raise exception 'expected auto-reveal to group_locked, got %', v_phase;
  end if;

  select min(c), max(c) into v_minpick, v_maxpick from (
    select count(*) c from team_ownership where phase = 'group' group by user_id
  ) s;
  if v_minpick <> v_tpp or v_maxpick <> v_tpp then
    raise exception 'expected every player to have % teams; got min % max %', v_tpp, v_minpick, v_maxpick;
  end if;

  select count(distinct team_id) into v_distinct from team_ownership where phase = 'group';
  if v_distinct <> v_total then
    raise exception 'expected % distinct teams, got %', v_total, v_distinct;
  end if;

  raise notice 'DRAFT SIMULATION PASSED';
end;
$$;

rollback;
```

- [ ] **Step 2: Run the simulation in Supabase**

Open the SQL editor → paste the file → Run.
Expected: a NOTICE `DRAFT SIMULATION PASSED` and no committed rows (the `rollback` discards the throwaway players). If you instead see an exception, the assertion message names the failed invariant — fix the migration in Task 2 and re-run.

- [ ] **Step 3: Confirm no residue**

Run:

```sql
select count(*) from profiles where display_name like 'Sim Player %';
```

Expected: `0` (the rollback removed them). `game_config` is back to whatever it was before the sim because the `update` was inside the rolled-back transaction.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/0005_draft_simulation.sql
git commit -m "test(draft): full-draft SQL simulation asserting invariants + auto-reveal"
```

---

## Task 4: Server actions for the draft

**Files:**
- Create: `app/(app)/draft/actions.ts`

These thin wrappers call the RPCs and re-render `/draft`. On RPC error they redirect back with a readable message (the page reads `searchParams.error`).

- [ ] **Step 1: Write the actions**

Create `app/(app)/draft/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function backWithError(message: string): never {
  redirect(`/draft?error=${encodeURIComponent(message)}`);
}

export async function startDraft() {
  const supabase = createClient();
  const { error } = await supabase.rpc("start_draft");
  if (error) backWithError(error.message);
  revalidatePath("/draft");
  redirect("/draft");
}

export async function makePick(teamId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("make_pick", { p_team_id: teamId });
  if (error) backWithError(error.message);
  revalidatePath("/draft");
  redirect("/draft");
}

export async function adminAutopick() {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_autopick");
  if (error) backWithError(error.message);
  revalidatePath("/draft");
  redirect("/draft");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `tsc` is not wired up, run `npm run build` later in Task 7; `next build` type-checks.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/draft/actions.ts"
git commit -m "feat(draft): server actions wrapping start/pick/autopick RPCs"
```

---

## Task 5: Gate `/draft` behind auth in middleware

Today middleware gates every non-public route behind the site-password cookie, and additionally requires a Supabase session only for `/home`. Extend that session check to `/draft` so an unauthenticated (but gated) visitor is sent to `/login`.

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Make the edit**

In `middleware.ts`, change the `/home` auth check to also cover `/draft`:

```ts
  // 2) Refresh the Supabase session and gate authed app routes behind login.
  const { response, user } = await updateSession(request);
  const needsAuth =
    pathname.startsWith("/home") || pathname.startsWith("/draft");
  if (gated && needsAuth && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
```

(This replaces the existing block that read `if (gated && pathname.startsWith("/home") && !user)`.)

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat(draft): require auth for /draft route"
```

---

## Task 6: The `/draft` page + components

The page is a server component that reads `draft_state()` and branches on `phase`. Sub-components handle presentation; only the board needs interactivity, so it's the lone client component.

**Files:**
- Create: `app/(app)/draft/page.tsx`
- Create: `components/draft/DraftStatus.tsx`
- Create: `components/draft/DraftBoard.tsx`
- Create: `components/draft/Rosters.tsx`
- Create: `components/draft/AdminControls.tsx`

- [ ] **Step 1: Define the shared types + status component**

Create `components/draft/DraftStatus.tsx`:

```tsx
// Shape of the JSON returned by the draft_state() RPC.
export interface BoardTeam {
  id: string;
  name: string;
  group_letter: string | null;
  flag_url: string | null;
  taken: boolean;
  owner_name: string | null; // null while phase = 'draft'
}

export interface Roster {
  user_id: string;
  display_name: string;
  team_ids: string[];
}

export interface DraftState {
  phase:
    | "registration"
    | "draft"
    | "group_locked"
    | "knockout_realloc"
    | "knockout_locked"
    | "complete";
  is_admin: boolean;
  current_user_id: string | null;
  current_user_name: string | null;
  is_my_turn: boolean;
  picks_made: number;
  picks_total: number;
  order_names: string[];
  my_team_ids: string[];
  board: BoardTeam[];
  rosters: Roster[] | null;
}

export default function DraftStatus({ state }: { state: DraftState }) {
  const { phase, is_my_turn, current_user_name, picks_made, picks_total } = state;

  if (phase === "registration") {
    return (
      <p className="text-bodytext">
        The draft hasn&apos;t started yet. Once the admin opens it, come back here to pick.
      </p>
    );
  }

  if (phase === "draft") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold">
          {is_my_turn ? (
            <span className="text-gold">It&apos;s YOUR turn — pick a team</span>
          ) : (
            <>Waiting on <span className="text-white">{current_user_name}</span>…</>
          )}
        </p>
        <p className="text-sm text-caption">Pick {picks_made + 1} of {picks_total}</p>
      </div>
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

- [ ] **Step 2: Build the board (client component)**

Create `components/draft/DraftBoard.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import type { BoardTeam } from "./DraftStatus";

// Groups the 48 teams A–L. During the draft, available teams are tappable only
// on your turn; tapping selects, then a confirm bar commits via makePick.
export default function DraftBoard({
  board,
  isMyTurn,
  myTeamIds,
  revealed,
  makePick,
}: {
  board: BoardTeam[];
  isMyTurn: boolean;
  myTeamIds: string[];
  revealed: boolean;
  makePick: (teamId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<BoardTeam | null>(null);
  const [pending, startTransition] = useTransition();
  const mine = new Set(myTeamIds);

  // Group by letter, preserving the board's A→L, name-sorted order.
  const groups = new Map<string, BoardTeam[]>();
  for (const t of board) {
    const key = t.group_letter ?? "?";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  function confirm() {
    if (!selected) return;
    const id = selected.id;
    startTransition(async () => {
      await makePick(id);
      setSelected(null);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([letter, teams]) => (
        <div key={letter}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-caption">
            Group {letter}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {teams.map((t) => {
              const isMine = mine.has(t.id);
              const tappable = isMyTurn && !t.taken && !pending;
              return (
                <button
                  key={t.id}
                  disabled={!tappable}
                  onClick={() => tappable && setSelected(t)}
                  className={[
                    "flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition",
                    t.taken
                      ? isMine
                        ? "border-gold/60 bg-panel text-gold"
                        : "border-glow bg-panel/50 text-caption opacity-60"
                      : tappable
                        ? "border-glow bg-panel text-white hover:border-gold hover:brightness-110"
                        : "border-glow bg-panel text-bodytext",
                  ].join(" ")}
                >
                  {t.flag_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.flag_url} alt="" className="h-4 w-6 shrink-0 rounded-sm object-cover" />
                  )}
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.taken && (
                    <span className="text-[10px] uppercase">
                      {revealed && t.owner_name ? t.owner_name : isMine ? "yours" : "taken"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-glow bg-navy/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <span className="text-sm">
              Draft <strong className="text-gold">{selected.name}</strong>?
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                disabled={pending}
                className="rounded-full border border-glow px-4 py-2 text-sm text-caption"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={pending}
                className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Picking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build the revealed rosters component**

Create `components/draft/Rosters.tsx`:

```tsx
import type { BoardTeam, Roster } from "./DraftStatus";

// After group_locked: one card per player with their 3 teams, in pick order.
export default function Rosters({
  rosters,
  board,
}: {
  rosters: Roster[];
  board: BoardTeam[];
}) {
  const byId = new Map(board.map((t) => [t.id, t]));
  return (
    <div className="flex flex-col gap-3">
      {rosters.map((r) => (
        <div key={r.user_id} className="rounded-xl border border-glow bg-panel p-4">
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
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build the admin controls**

Create `components/draft/AdminControls.tsx`:

```tsx
import { startDraft, adminAutopick } from "@/app/(app)/draft/actions";

// Admin-only controls shown on /draft. During registration: Start. During the
// draft: Auto-pick for the stalled current player (used after a nudge).
export default function AdminControls({
  phase,
  currentUserName,
}: {
  phase: string;
  currentUserName: string | null;
}) {
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gold">Admin</h2>
      {phase === "registration" && (
        <form action={startDraft} className="mt-3">
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-navy transition hover:brightness-110">
            Start draft
          </button>
          <p className="mt-2 text-xs text-caption">
            Randomises the pick order and opens the draft. Closes registration.
          </p>
        </form>
      )}
      {phase === "draft" && (
        <form action={adminAutopick} className="mt-3">
          <button className="rounded-full border border-gold px-5 py-2 text-sm font-bold text-gold transition hover:bg-gold hover:text-navy">
            Auto-pick for {currentUserName ?? "current player"}
          </button>
          <p className="mt-2 text-xs text-caption">
            Assigns a random available team to the current player. Use only after nudging them.
          </p>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Build the page**

Create `app/(app)/draft/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { makePick } from "./actions";
import DraftStatus, { type DraftState } from "@/components/draft/DraftStatus";
import DraftBoard from "@/components/draft/DraftBoard";
import Rosters from "@/components/draft/Rosters";
import AdminControls from "@/components/draft/AdminControls";

export const dynamic = "force-dynamic"; // always reflect live draft state

export default async function DraftPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("draft_state");
  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-bold">Draft</h1>
        <p className="text-red-400">Couldn&apos;t load the draft: {error?.message ?? "no data"}</p>
      </main>
    );
  }
  const state = data as DraftState;
  const revealed = state.phase !== "registration" && state.phase !== "draft";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-28">
      <header>
        <h1 className="text-2xl font-bold">The Draft</h1>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}

      <DraftStatus state={state} />

      {state.is_admin && (
        <AdminControls phase={state.phase} currentUserName={state.current_user_name} />
      )}

      {(state.phase === "draft" || revealed) && (
        <DraftBoard
          board={state.board}
          isMyTurn={state.is_my_turn}
          myTeamIds={state.my_team_ids}
          revealed={revealed}
          makePick={makePick}
        />
      )}

      {revealed && state.rosters && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Rosters</h2>
          <Rosters rosters={state.rosters} board={state.board} />
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Build and type-check**

Run: `npm run build`
Expected: build succeeds (compiles + type-checks). Fix any type mismatches against the `DraftState` interface before continuing.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/draft/page.tsx" components/draft
git commit -m "feat(draft): /draft page — board, roster reveal, admin controls"
```

---

## Task 7: Wire the home link + docs

Add a path from the holding page to the draft once it's open, and document applying the migration + running the simulation.

**Files:**
- Modify: `app/(app)/home/page.tsx`
- Modify: `README.md`

- [ ] **Step 1: Add a draft link on the home page**

In `app/(app)/home/page.tsx`, after the existing `Promise.all` that loads `me` and `players`, also read the current phase. Replace the `Promise.all` destructuring block with:

```tsx
  const [{ data: me }, { data: players }, { data: cfg }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, display_name")
      .order("created_at", { ascending: true }),
    supabase.from("game_config").select("current_phase").eq("id", 1).single(),
  ]);

  const list = players ?? [];
  const draftOpen = (cfg?.current_phase ?? "registration") !== "registration";
```

Then, immediately after the `<div>` header block (the one containing the welcome `<p>`) and before the "Players registered" `<section>`, insert:

```tsx
      {draftOpen && (
        <a
          href="/draft"
          className="inline-block rounded-full bg-gold px-6 py-3 text-center text-sm font-bold uppercase tracking-wide text-navy transition hover:brightness-110"
        >
          Go to the draft →
        </a>
      )}
```

- [ ] **Step 2: Update the welcome copy so it isn't stale once the draft opens**

In the same file, change the welcome paragraph so it only claims "the draft hasn't opened" during registration. Replace:

```tsx
          Welcome, <strong className="text-white">{me?.display_name ?? "player"}</strong>.
          The draft hasn&apos;t opened yet — sit tight.
```

with:

```tsx
          Welcome, <strong className="text-white">{me?.display_name ?? "player"}</strong>.
          {draftOpen ? " The draft is underway — head in and pick." : " The draft hasn't opened yet — sit tight."}
```

- [ ] **Step 3: Document the migration + simulation in the README**

In `README.md`, the "Apply the SQL" step (around line 30) has a numbered sub-list ending at:

```markdown
   4. `supabase/seed/teams.generated.sql`
```

Add a fifth sub-item directly after it, then a follow-up note:

```markdown
   5. `supabase/migrations/0005_draft.sql` — the snake-draft engine (security-definer functions).

   After applying `0005`, verify the engine end-to-end: paste
   `supabase/tests/0005_draft_simulation.sql` into the SQL editor and Run —
   expect a `DRAFT SIMULATION PASSED` notice (it rolls itself back, leaving no data).
```

(The README's existing list omits `0004_registration_open.sql`; leave that as-is — out of scope here. Just append `0005` as shown.)

- [ ] **Step 4: Build to confirm the home page still compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/home/page.tsx" README.md
git commit -m "feat(draft): link home → draft once open; document migration + sim"
```

---

## Manual end-to-end verification (after all tasks)

Do this against the deployed app (or `npm run dev`) with the migration applied:

1. **Register ≥2 players** (the existing flow). Make one of them admin: in the SQL editor, `update profiles set is_admin = true where display_name = 'YourName';`
2. As the admin, visit `/draft` → you should see the **Start draft** button. Click it. Phase → `draft`, registration CTA on the landing page goes disabled.
3. As the **current player**, the board shows tappable available teams; tapping → confirm bar → Confirm writes the pick and advances the turn. As a **non-current** player the board is read-only and shows only `taken` (no owner names).
4. **Stall test:** with it on player X's turn, as admin click **Auto-pick for {X}** → a random team is assigned to X and the turn advances.
5. Complete all `players × 3` picks → the **last pick auto-flips** the phase to `group_locked`; every player now sees **full rosters** and owner names on the board, and the landing/home copy reflects that the draft is done.
6. Negative checks: a non-current player calling pick is rejected ("it is not your turn"); picking an already-taken team is rejected ("that team is already taken"); a non-admin calling start/autopick is rejected.

---

## Self-review notes (coverage against the spec)

- `start_draft` / `make_pick` / `admin_autopick` / `draft_state` → Task 2; matches spec §"Implementation design (Plan 2)".
- Blind-during / reveal-after enforced in DB (no `team_ownership` select policy; `draft_state` is the only window; `owner_name` gated on phase) → Task 2.
- Auto-reveal on the final pick (`group_locked`) → `_apply_pick` in Task 2; asserted in Task 3.
- Admin-triggered random auto-pick, **no automatic timeout** → `admin_autopick` (Task 2) + AdminControls (Task 6). `draft_pick_window_secs` remains advisory; nothing reads it as an expiry.
- Snake order (forward/reverse/forward) → `lib/draft.ts` (Task 1) mirrored by `_draft_player_at` (Task 2), cross-checked by the full simulation (Task 3).
- `/draft` UI: status line, A–L board with flags (greyed taken / tappable-on-turn → confirm), own roster, admin controls on the same page, full rosters after lock → Task 6.
- Mobile-first, gold-on-navy theme → Task 6 (single-column `max-w-md`, gold accents).
- TDD pure helper + simulate full draft asserting 3-each and auto-reveal → Tasks 1 & 3.
