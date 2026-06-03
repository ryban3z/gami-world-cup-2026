# Bonus Predictions + Kickoff Lock (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each player submit and edit up to 2 bonus picks per category while the window is open (opening with the draft), keep picks private until an admin locks them at kickoff, then reveal everyone's picks.

**Architecture:** Two new `game_config` columns (`predictions_open`, `predictions_locked_at`) gate the window. Writes go through a `security definer` RPC (`save_bonus_category`) that enforces the open window; reads use a Row Level Security policy that reveals all picks once locked. The window opens automatically when `start_draft()` runs and closes via an admin `lock_predictions()` RPC. The `/predictions` page renders an editable form while open and a read-only reveal once locked.

**Tech Stack:** Next.js 14.2 App Router (Server Components + Server Actions, no client components needed — plain `<form action>`), Supabase Postgres + RLS, Vitest for a pure validation helper, Tailwind (gold-on-navy).

---

## Background the engineer needs

**Schema already exists** (`supabase/migrations/0001_initial_schema.sql`):

- `game_config` (single row `id = 1`): has `current_phase`, `registration_open boolean`, etc. This plan **adds** `predictions_open boolean` and `predictions_locked_at timestamptz`.
- `bonus_categories`: `(id uuid, key text unique, name text, is_active boolean, resolved_answer text)`. Seeded with 5 active rows (`supabase/seed/0003_seed_config_categories.sql`): keys `golden_boot`, `golden_ball`, `golden_glove`, `young_player`, `tournament_winner`. RLS already lets any authenticated user read this table.
- `bonus_predictions`: `(id, user_id, category_id, pick_slot int check (pick_slot in (1,2)), pick_value text, is_active boolean default true, superseded_by, created_at)`. There is a **partial unique index**: `create unique index uq_active_bonus_pick on bonus_predictions (user_id, category_id, pick_slot) where is_active;`. RLS is **enabled with no policies** (deny-by-default) — this plan adds a `select` policy; writes stay denied so they must go through the security-definer RPC.
- `teams`: 48 rows with `id`, `name`. Readable by any authenticated user. Used for the *Tournament Winner* dropdown.
- `profiles`: `id`, `display_name`, `is_admin`. Readable by all authenticated users.

**Scope (from the spec):** submission + kickoff lock only. **Out of scope:** scoring resolution (marking correct answers / awarding points) and the post-group wildcard. Don't build those.

**Existing conventions to copy:**
- Security-definer RPC + grant pattern: see `supabase/migrations/0005_draft.sql` (`language plpgsql security definer set search_path = public`, admin check `coalesce((select is_admin from profiles where id = auth.uid()), false)`, then `grant execute ... to authenticated`).
- Server actions next to the route as `actions.ts` with `"use server"`, `redirect()` from `next/navigation`, `revalidatePath()` from `next/cache`. See `app/(app)/draft/actions.ts`.
- Server-rendered forms posting to server actions (no client component needed). See `components/draft/AdminControls.tsx` — it imports server actions directly and uses `<form action={...}>`.
- Page pattern: `app/(app)/draft/page.tsx` — `export const dynamic = "force-dynamic"`, `getUser()` → redirect `/login` if absent, read data, branch on state.
- Tests: Vitest, `@/` alias works, see `lib/draft.test.ts`. Run one file: `npx vitest run lib/predictions.test.ts`.
- Inputs are already themed dark in `app/globals.css` (`input, textarea, select`), so `className="rounded border p-3"` matches the auth forms.
- Migrations are applied by hand in the Supabase SQL editor. Next number after `0005` is `0006`.

**Snake-draft coupling:** Task 2 reissues `start_draft()` (via `create or replace`) with one extra line so opening the draft also opens the prediction window. The full current body is reproduced in that task — use it verbatim plus the one change.

---

## File structure

- `lib/predictions.ts` — pure validation (two picks must differ). No IO.
- `lib/predictions.test.ts` — Vitest unit tests.
- `supabase/migrations/0006_predictions.sql` — new columns, `start_draft()` replacement, `lock_predictions()`, `save_bonus_category()`, the RLS read policy, grants.
- `supabase/tests/0006_predictions_simulation.sql` — runnable assertion script (window enforcement, edit/clear, distinct rule, lock + reveal).
- `app/(app)/predictions/actions.ts` — `savePredictions`, `lockPredictions` server actions.
- `app/(app)/predictions/page.tsx` — the `/predictions` page (branches on open/locked).
- `components/predictions/PredictionForm.tsx` — editable form + admin lock (server component).
- `components/predictions/RevealPicks.tsx` — read-only reveal grouped by category (server component).
- `middleware.ts` — add `/predictions` to the auth gate.
- `app/(app)/home/page.tsx` — link to `/predictions` once the window has opened.
- `README.md` — note applying `0006` + running the simulation.

---

## Task 1: Pure validation helper (TDD)

**Files:**
- Create: `lib/predictions.ts`
- Test: `lib/predictions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/predictions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateCategoryPicks } from "@/lib/predictions";

describe("validateCategoryPicks", () => {
  it("accepts two different picks", () => {
    expect(validateCategoryPicks("Messi", "Mbappe")).toEqual({ ok: true });
  });
  it("accepts when one or both are blank (partial entry allowed)", () => {
    expect(validateCategoryPicks("Messi", "")).toEqual({ ok: true });
    expect(validateCategoryPicks("", "")).toEqual({ ok: true });
    expect(validateCategoryPicks("   ", "Messi")).toEqual({ ok: true });
  });
  it("rejects two identical picks (case- and whitespace-insensitive)", () => {
    expect(validateCategoryPicks("Messi", "messi").ok).toBe(false);
    expect(validateCategoryPicks("  Messi ", "Messi").ok).toBe(false);
  });
  it("returns a human-readable error message on duplicates", () => {
    const r = validateCategoryPicks("Pele", "pele");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/different/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/predictions.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/predictions"`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/predictions.ts`:

```ts
// Pure validation for a single bonus category's two picks. No IO. The database
// (save_bonus_category) enforces the same rule as the backstop; this gives the
// UI a friendly inline error before the round-trip.

export type PicksValidation = { ok: true } | { ok: false; error: string };

/** Two picks in one category must differ (ignoring case/whitespace). Blanks are allowed. */
export function validateCategoryPicks(value1: string, value2: string): PicksValidation {
  const v1 = value1.trim();
  const v2 = value2.trim();
  if (v1 && v2 && v1.toLowerCase() === v2.toLowerCase()) {
    return { ok: false, error: "Your two picks for a category must be different." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/predictions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/predictions.ts lib/predictions.test.ts
git commit -m "feat(predictions): pure two-distinct-picks validation helper"
```

---

## Task 2: Predictions engine migration (SQL)

**Files:**
- Create: `supabase/migrations/0006_predictions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_predictions.sql`:

```sql
-- ============================================================
-- Bonus predictions: submission window + kickoff lock (Plan 3).
-- Window opens with the draft (start_draft sets predictions_open=true) and is
-- closed by an admin via lock_predictions(), which also reveals everyone's
-- picks. Writes go through a security-definer RPC that enforces the open
-- window; reads use an RLS policy that reveals all picks once locked.
-- Canonical design: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ---------- window state on game_config ----------
alter table game_config
  add column if not exists predictions_open      boolean not null default false,
  add column if not exists predictions_locked_at timestamptz;

-- ---------- start_draft(): now also opens the prediction window ----------
-- Reissued verbatim from 0005 with one added line: predictions_open = true.
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
         predictions_open = true,          -- open the bonus-prediction window with the draft
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- lock_predictions(): admin closes the window + reveals ----------
create or replace function public.lock_predictions()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can lock predictions';
  end if;
  if (select predictions_locked_at from game_config where id = 1) is not null then
    raise exception 'predictions are already locked';
  end if;
  update game_config
     set predictions_open = false,
         predictions_locked_at = now(),
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- save_bonus_category(): upsert/clear a player's 2 picks ----------
-- Authenticated caller saves their own picks for one category. Empty values
-- clear that slot. The two picks must differ. Only works while the window is
-- open. SECURITY DEFINER bypasses RLS for the write; direct client writes stay
-- denied (no insert/update/delete policy), so the open-window rule holds.
create or replace function public.save_bonus_category(
  p_category_id uuid,
  p_value1 text,
  p_value2 text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v1 text := nullif(btrim(coalesce(p_value1, '')), '');
  v2 text := nullif(btrim(coalesce(p_value2, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not coalesce((select predictions_open from game_config where id = 1), false) then
    raise exception 'the prediction window is closed';
  end if;
  if not exists (select 1 from bonus_categories where id = p_category_id and is_active) then
    raise exception 'no such active category';
  end if;
  if v1 is not null and v2 is not null and lower(v1) = lower(v2) then
    raise exception 'your two picks for a category must be different';
  end if;

  -- slot 1
  if v1 is null then
    delete from bonus_predictions
     where user_id = v_uid and category_id = p_category_id and pick_slot = 1 and is_active;
  else
    insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_uid, p_category_id, 1, v1)
    on conflict (user_id, category_id, pick_slot) where is_active
    do update set pick_value = excluded.pick_value;
  end if;

  -- slot 2
  if v2 is null then
    delete from bonus_predictions
     where user_id = v_uid and category_id = p_category_id and pick_slot = 2 and is_active;
  else
    insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_uid, p_category_id, 2, v2)
    on conflict (user_id, category_id, pick_slot) where is_active
    do update set pick_value = excluded.pick_value;
  end if;
end;
$$;

-- ---------- RLS: own picks always; everyone's once locked ----------
create policy "read own or revealed bonus predictions"
  on bonus_predictions for select to authenticated
  using (
    user_id = auth.uid()
    or (select predictions_locked_at from game_config where id = 1) is not null
  );

-- ---------- grants ----------
grant execute on function public.lock_predictions()                  to authenticated;
grant execute on function public.save_bonus_category(uuid, text, text) to authenticated;
-- start_draft() was already granted in 0005.
```

- [ ] **Step 2: Apply the migration in Supabase**

Open the Supabase SQL editor → paste the full contents of `0006_predictions.sql` → Run.
Expected: `Success. No rows returned.`

- [ ] **Step 3: Smoke-check**

Run:

```sql
select column_name from information_schema.columns
where table_name = 'game_config' and column_name in ('predictions_open','predictions_locked_at')
order by column_name;
```

Expected: 2 rows (`predictions_locked_at`, `predictions_open`).

Then:

```sql
select proname from pg_proc
where proname in ('lock_predictions','save_bonus_category')
order by proname;
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_predictions.sql
git commit -m "feat(predictions): window columns, save/lock RPCs, RLS reveal-on-lock"
```

---

## Task 3: End-to-end predictions simulation (SQL)

**Files:**
- Create: `supabase/tests/0006_predictions_simulation.sql`

- [ ] **Step 1: Write the simulation**

Create `supabase/tests/0006_predictions_simulation.sql`:

```sql
-- Runnable verification for the bonus-prediction engine (Plan 3). Paste into the
-- Supabase SQL editor and Run. Creates a throwaway admin player, then asserts:
-- writes are blocked while the window is closed, accepted while open, editing
-- overwrites, blanks clear a slot, duplicate picks are rejected, lock_predictions
-- closes + reveals, and writes after lock are rejected. Then ROLLS BACK.
--
-- Expected: a NOTICE "PREDICTIONS SIMULATION PASSED" and no committed rows.

begin;

do $$
declare
  v_id     uuid := gen_random_uuid();
  v_cat    uuid;
  v_count  int;
  v_locked timestamptz;
begin
  -- Create a player via the signup trigger (display_name in raw_user_meta_data),
  -- then make them admin (so lock_predictions passes). Impersonate them.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'pred-sim@sim.local',
            jsonb_build_object('display_name', 'Pred Sim'));
  update profiles set is_admin = true where id = v_id;
  perform set_config('request.jwt.claim.sub', v_id::text, true);

  select id into v_cat from bonus_categories where is_active order by key limit 1;

  -- 1) window closed -> write rejected
  update game_config set predictions_open = false, predictions_locked_at = null where id = 1;
  begin
    perform public.save_bonus_category(v_cat, 'Messi', 'Mbappe');
    raise exception 'expected closed-window write to be rejected';
  exception when others then
    if sqlerrm <> 'the prediction window is closed' then
      raise exception 'wrong error for closed window: %', sqlerrm;
    end if;
  end;

  -- 2) open window -> write accepted (2 picks)
  update game_config set predictions_open = true where id = 1;
  perform public.save_bonus_category(v_cat, 'Messi', 'Mbappe');
  select count(*) into v_count from bonus_predictions
   where user_id = v_id and category_id = v_cat and is_active;
  if v_count <> 2 then raise exception 'expected 2 picks, got %', v_count; end if;

  -- 3) editing overwrites in place (still 2)
  perform public.save_bonus_category(v_cat, 'Haaland', 'Mbappe');
  select count(*) into v_count from bonus_predictions
   where user_id = v_id and category_id = v_cat and is_active;
  if v_count <> 2 then raise exception 'expected 2 picks after edit, got %', v_count; end if;

  -- 4) clearing slot 2 (blank) deletes it
  perform public.save_bonus_category(v_cat, 'Haaland', '');
  select count(*) into v_count from bonus_predictions
   where user_id = v_id and category_id = v_cat and is_active;
  if v_count <> 1 then raise exception 'expected 1 pick after clearing slot 2, got %', v_count; end if;

  -- 5) duplicate picks rejected
  begin
    perform public.save_bonus_category(v_cat, 'Pele', 'pele');
    raise exception 'expected duplicate picks to be rejected';
  exception when others then
    if sqlerrm <> 'your two picks for a category must be different' then
      raise exception 'wrong error for duplicate: %', sqlerrm;
    end if;
  end;

  -- 6) admin lock sets the flags + reveal trigger
  perform public.lock_predictions();
  select predictions_locked_at into v_locked from game_config where id = 1;
  if v_locked is null then raise exception 'lock_predictions did not set predictions_locked_at'; end if;
  if (select predictions_open from game_config where id = 1) <> false then
    raise exception 'lock_predictions should close the window';
  end if;

  -- 7) writing after lock is rejected
  begin
    perform public.save_bonus_category(v_cat, 'Ronaldo', '');
    raise exception 'expected post-lock write to be rejected';
  exception when others then
    if sqlerrm <> 'the prediction window is closed' then
      raise exception 'wrong error after lock: %', sqlerrm;
    end if;
  end;

  raise notice 'PREDICTIONS SIMULATION PASSED';
end;
$$;

rollback;
```

- [ ] **Step 2: Run the simulation in Supabase**

Paste the file into the SQL editor → Run.
Expected: completes without error (a `PREDICTIONS SIMULATION PASSED` notice in the Messages pane; the editor reports "Success. No rows returned" because of the rollback). Any `ERROR:` means an assertion failed — the message names which.

- [ ] **Step 3: Confirm no residue**

Run:

```sql
select count(*) from profiles where display_name = 'Pred Sim';
```

Expected: `0` (rolled back).

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/0006_predictions_simulation.sql
git commit -m "test(predictions): SQL simulation for window, edit/clear, distinct, lock+reveal"
```

---

## Task 4: Server actions

**Files:**
- Create: `app/(app)/predictions/actions.ts`

- [ ] **Step 1: Write the actions**

Create `app/(app)/predictions/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateCategoryPicks } from "@/lib/predictions";

// Saves the whole form: one save_bonus_category RPC call per active category.
// Form fields are named c_<categoryId>_1 and c_<categoryId>_2.
export async function savePredictions(formData: FormData) {
  const supabase = createClient();
  const { data: categories } = await supabase
    .from("bonus_categories")
    .select("id")
    .eq("is_active", true);

  for (const c of categories ?? []) {
    const v1 = String(formData.get(`c_${c.id}_1`) ?? "");
    const v2 = String(formData.get(`c_${c.id}_2`) ?? "");

    const check = validateCategoryPicks(v1, v2);
    if (!check.ok) redirect(`/predictions?error=${encodeURIComponent(check.error)}`);

    const { error } = await supabase.rpc("save_bonus_category", {
      p_category_id: c.id,
      p_value1: v1,
      p_value2: v2,
    });
    if (error) redirect(`/predictions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/predictions");
  redirect("/predictions?saved=1");
}

export async function lockPredictions() {
  const supabase = createClient();
  const { error } = await supabase.rpc("lock_predictions");
  if (error) redirect(`/predictions?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/predictions");
  redirect("/predictions");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`redirect()` returns `never`, so the loop's control flow is fine.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/predictions/actions.ts"
git commit -m "feat(predictions): save/lock server actions"
```

---

## Task 5: Auth gate + home link

**Files:**
- Modify: `middleware.ts`
- Modify: `app/(app)/home/page.tsx`

- [ ] **Step 1: Gate `/predictions` behind auth**

In `middleware.ts`, extend the `needsAuth` check to include `/predictions`. Replace:

```ts
  const needsAuth =
    pathname.startsWith("/home") || pathname.startsWith("/draft");
```

with:

```ts
  const needsAuth =
    pathname.startsWith("/home") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/predictions");
```

- [ ] **Step 2: Read the prediction-window state on the home page**

In `app/(app)/home/page.tsx`, the `Promise.all` currently selects `current_phase` from `game_config`. Replace that select and the derived flag. Change:

```tsx
    supabase.from("game_config").select("current_phase").eq("id", 1).single(),
  ]);

  const list = players ?? [];
  const draftOpen = (cfg?.current_phase ?? "registration") !== "registration";
```

to:

```tsx
    supabase
      .from("game_config")
      .select("current_phase, predictions_open, predictions_locked_at")
      .eq("id", 1)
      .single(),
  ]);

  const list = players ?? [];
  const draftOpen = (cfg?.current_phase ?? "registration") !== "registration";
  const predictionsStarted = (cfg?.predictions_open ?? false) || cfg?.predictions_locked_at != null;
```

- [ ] **Step 3: Add the predictions link**

In the same file, directly after the existing `draftOpen` link block (the `{draftOpen && ( ... "Go to the draft →" ... )}` anchor), add:

```tsx
      {predictionsStarted && (
        <a
          href="/predictions"
          className="inline-block rounded-full border border-gold px-6 py-3 text-center text-sm font-bold uppercase tracking-wide text-gold transition hover:bg-gold hover:text-navy"
        >
          Bonus predictions →
        </a>
      )}
```

- [ ] **Step 4: Build to verify both files compile**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts "app/(app)/home/page.tsx"
git commit -m "feat(predictions): gate /predictions; link from home once window opens"
```

---

## Task 6: The `/predictions` page + components

**Files:**
- Create: `components/predictions/PredictionForm.tsx`
- Create: `components/predictions/RevealPicks.tsx`
- Create: `app/(app)/predictions/page.tsx`

- [ ] **Step 1: Build the editable form (server component)**

Create `components/predictions/PredictionForm.tsx`:

```tsx
import { savePredictions, lockPredictions } from "@/app/(app)/predictions/actions";

interface Category {
  id: string;
  key: string;
  name: string;
}
interface Team {
  id: string;
  name: string;
}

// Editable form: 2 inputs per active category. The Tournament Winner category
// (key 'tournament_winner') renders team dropdowns; the rest are free text.
// Prefilled from the caller's existing picks. One Save action for the whole form.
export default function PredictionForm({
  categories,
  teams,
  picksByKey,
  isAdmin,
}: {
  categories: Category[];
  teams: Team[];
  picksByKey: Record<string, string>;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <form action={savePredictions} className="flex flex-col gap-4">
        {categories.map((c) => {
          const isWinner = c.key === "tournament_winner";
          return (
            <div key={c.id} className="rounded-xl border border-glow bg-panel p-4">
              <h3 className="mb-2 text-sm font-bold text-gold">{c.name}</h3>
              <div className="flex flex-col gap-2">
                {[1, 2].map((slot) => {
                  const name = `c_${c.id}_${slot}`;
                  const val = picksByKey[`${c.id}_${slot}`] ?? "";
                  return isWinner ? (
                    <select key={slot} name={name} defaultValue={val} className="rounded border p-3">
                      <option value="">— pick a team —</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      key={slot}
                      name={name}
                      defaultValue={val}
                      placeholder={`Pick ${slot}`}
                      className="rounded border p-3"
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <button className="rounded-full bg-gold px-6 py-3 font-bold text-navy transition hover:brightness-110">
          Save predictions
        </button>
      </form>

      {isAdmin && (
        <form action={lockPredictions} className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gold">Admin</h2>
          <button className="mt-3 rounded-full border border-gold px-5 py-2 text-sm font-bold text-gold transition hover:bg-gold hover:text-navy">
            Lock predictions (kickoff)
          </button>
          <p className="mt-2 text-xs text-caption">
            Closes the window and reveals everyone&apos;s picks. Can&apos;t be undone.
          </p>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the reveal (server component)**

Create `components/predictions/RevealPicks.tsx`:

```tsx
interface Category {
  id: string;
  key: string;
  name: string;
}
interface Pick {
  user_id: string;
  category_id: string;
  pick_slot: number;
  pick_value: string;
}

// Read-only reveal after lock: one card per category, each player's picks listed.
export default function RevealPicks({
  categories,
  picks,
  nameById,
}: {
  categories: Category[];
  picks: Pick[];
  nameById: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {categories.map((c) => {
        const rows = picks
          .filter((p) => p.category_id === c.id)
          .sort((a, b) => a.pick_slot - b.pick_slot);
        const byUser = new Map<string, string[]>();
        for (const p of rows) {
          if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
          byUser.get(p.user_id)!.push(p.pick_value);
        }
        return (
          <div key={c.id} className="rounded-xl border border-glow bg-panel p-4">
            <h3 className="text-sm font-bold text-gold">{c.name}</h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {[...byUser.entries()].map(([uid, vals]) => (
                <li key={uid} className="flex justify-between gap-2">
                  <span className="text-caption">{nameById[uid] ?? "player"}</span>
                  <span className="text-right text-white">{vals.join(", ")}</span>
                </li>
              ))}
              {byUser.size === 0 && <li className="text-caption">No picks.</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Build the page**

Create `app/(app)/predictions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PredictionForm from "@/components/predictions/PredictionForm";
import RevealPicks from "@/components/predictions/RevealPicks";

export const dynamic = "force-dynamic";

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: cfg },
    { data: me },
    { data: categories },
    { data: teams },
    { data: picks },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("game_config").select("predictions_open, predictions_locked_at").eq("id", 1).single(),
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
    supabase.from("bonus_categories").select("id, key, name").eq("is_active", true).order("name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("bonus_predictions").select("user_id, category_id, pick_slot, pick_value"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const open = cfg?.predictions_open ?? false;
  const locked = cfg?.predictions_locked_at != null;
  const isAdmin = me?.is_admin ?? false;
  const cats = categories ?? [];
  const allPicks = picks ?? [];

  // Caller's own picks, keyed for prefilling the form.
  const picksByKey: Record<string, string> = {};
  for (const p of allPicks) {
    if (p.user_id === user.id) picksByKey[`${p.category_id}_${p.pick_slot}`] = p.pick_value;
  }
  const nameById: Record<string, string> = {};
  for (const pr of profiles ?? []) nameById[pr.id] = pr.display_name;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20">
      <header>
        <h1 className="text-2xl font-bold">Bonus Predictions</h1>
        <p className="mt-1 text-sm text-bodytext">
          2 picks per category — the two must differ. Locks at kickoff.
        </p>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}
      {searchParams.saved && !searchParams.error && (
        <p className="rounded-lg border border-gold/40 bg-panel p-3 text-sm text-gold">Saved.</p>
      )}

      {!open && !locked && (
        <p className="text-bodytext">Predictions open when the admin starts the draft. Sit tight.</p>
      )}

      {open && !locked && (
        <PredictionForm categories={cats} teams={teams ?? []} picksByKey={picksByKey} isAdmin={isAdmin} />
      )}

      {locked && (
        <>
          <p className="text-lg font-bold text-gold">Locked — here&apos;s everyone&apos;s picks.</p>
          <RevealPicks categories={cats} picks={allPicks} nameById={nameById} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Build and type-check**

Run: `npm run build`
Expected: build succeeds; `/predictions` appears as a dynamic (`ƒ`) route. Fix any type mismatches against the component prop types before continuing.

- [ ] **Step 5: Commit**

```bash
git add components/predictions "app/(app)/predictions/page.tsx"
git commit -m "feat(predictions): /predictions page — editable form + reveal-on-lock"
```

---

## Task 7: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add `0006` to the SQL apply list**

In `README.md`, the "Apply the SQL" sub-list ends with item `6. ...0005_draft.sql`, immediately followed by an indented paragraph that begins `After applying 0005, verify the engine end-to-end:` and ends `...leaving no data).`. Insert the new item + note **right after that `0005` note paragraph** (and before the outer `4. Disable email confirmation` line). The exact text to insert:

```markdown
   7. `supabase/migrations/0006_predictions.sql` — bonus-prediction window + save/lock RPCs.

   After applying `0006`, verify it: paste `supabase/tests/0006_predictions_simulation.sql`
   into the SQL Editor and Run — expect a `PREDICTIONS SIMULATION PASSED` notice (it rolls
   itself back, leaving no data).
```

(If the list numbering differs, append `0006_predictions.sql` as the next item in the same style, followed by the simulation note.)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(predictions): apply 0006 + run the predictions simulation"
```

---

## Manual end-to-end verification (after all tasks)

With `0006` applied, against `npm run dev` or the deploy:

1. While in `registration`, visit `/predictions` → "Predictions open when the admin starts the draft."
2. As admin, start the draft (`/draft` → Start draft). Revisit `/predictions` → the editable form appears (the window opened with the draft). The home page now shows a **Bonus predictions →** link.
3. Fill some picks (text for the player categories, the dropdown for Tournament Winner), Save → "Saved." Reload → values persist. Change one and Save → it overwrites. Clear a field and Save → that pick disappears.
4. Enter the same value in both slots of a category → Save is rejected with "Your two picks for a category must be different."
5. As a **different** player, you see only your own picks (not others') while open.
6. As admin, click **Lock predictions (kickoff)** → the form is replaced by the read-only reveal; **all** players' picks are now visible to everyone, and saving is no longer possible.

---

## Self-review notes (coverage against the spec)

- `predictions_open` + `predictions_locked_at` on `game_config` → Task 2.
- Opens with the draft (`start_draft` sets `predictions_open = true`) → Task 2 (function reissued verbatim + one line).
- `lock_predictions()` admin RPC = kickoff lock + reveal → Task 2; asserted in Task 3.
- `submit`/save via security-definer RPC enforcing the open window; direct writes denied → `save_bonus_category` (Task 2); window enforcement asserted in Task 3.
- Visibility: own always, everyone once locked, via RLS keyed on `predictions_locked_at` → Task 2 policy; page relies on it (Task 6).
- 2 picks/category, two must differ, partial allowed → `validateCategoryPicks` (Task 1) + DB rule in `save_bonus_category` (Task 2).
- Tournament Winner = team dropdown, others free text → Task 6 (`PredictionForm`).
- Single Save button for the whole form → Task 4 (`savePredictions`) + Task 6.
- `/predictions` page, admin lock on same page, reveal after lock → Task 6.
- Home link once window open; `/predictions` gated behind auth → Task 5.
- Mobile-first, gold-on-navy → Task 6 (`max-w-md`, gold accents).
- TDD pure helper + SQL simulation (window blocks writes, reveal flips on lock) → Tasks 1 & 3.
- Out of scope (scoring resolution, wildcard) → not built. ✓
