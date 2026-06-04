# Admin Control Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate every pre-tournament admin action onto a single guarded `/admin` page with a confirm step on every button, and strip admin buttons from the home and predictions pages friends use.

**Architecture:** A server-component `/admin` page guarded by a `profiles.is_admin` check (redirects non-admins to `/home`). It renders a read-only phase banner plus action sections gated by `game_config` flags. Every state-changing button is a reusable two-step `ConfirmAction` client component wrapping a server action. One small migration adds an admin-guarded `set_registration_open` RPC so the registration toggle is a button instead of a manual SQL step. Existing admin RPCs (`start_draft`, `admin_autopick`, `lock_predictions`) are reused and removed from their old surfaces.

**Tech Stack:** Next.js 14 App Router (server components + server actions), TypeScript, Tailwind, Supabase RPC, Vitest.

**Design spec:** `docs/superpowers/specs/2026-06-04-admin-page-design.md`

**Codebase conventions to follow:**
- Server actions live in `app/(app)/<route>/actions.ts`, start with `"use server"`, call `supabase.rpc(...)`, `revalidatePath(...)`, then `redirect(...)`. On error they `redirect("/<route>?error=...")`. See `app/(app)/draft/actions.ts`.
- Pages are `async` server components with `export const dynamic = "force-dynamic"`, fetch with `createClient()` from `@/lib/supabase/server`, and read `searchParams.error` into a red banner.
- Submit buttons use `@/components/SubmitButton` (shows a pending label, disables while running).
- Pure view helpers live in `lib/*View.ts` with a colocated `lib/*View.test.ts` (Vitest). Presentational components have no unit tests (verified via build).
- **The implementer has NO Supabase DB credentials.** SQL migrations are applied by the USER in the Supabase SQL editor. Migration tasks deliver the `.sql` file and a manual verification step; do not attempt to run SQL.
- Verify TypeScript with `npx tsc --noEmit` (do NOT run `npm run lint` — it hangs on interactive ESLint setup). Run the full build with `npm run build`.

---

### Task 1: `set_registration_open` migration

Adds an admin-guarded setter for the existing `game_config.registration_open` column, so the admin page can toggle registration with a button instead of manual SQL. Mirrors the admin guard used by `lock_predictions` in `0006`.

**Files:**
- Create: `supabase/migrations/0008_admin_registration.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0008_admin_registration.sql`:

```sql
-- ============================================================
-- Admin registration toggle (Admin control panel).
-- The registration_open column already exists (0004). This adds an
-- admin-guarded setter so the /admin page can open/close registration
-- with a button instead of a manual SQL update. Guard mirrors
-- lock_predictions() in 0006.
-- Canonical design: docs/superpowers/specs/2026-06-04-admin-page-design.md
-- ============================================================

create or replace function public.set_registration_open(p_open boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can change registration';
  end if;
  update game_config set registration_open = p_open where id = 1;
end;
$$;

grant execute on function public.set_registration_open(boolean) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0008_admin_registration.sql
git commit -m "feat(db): add admin-guarded set_registration_open RPC"
```

- [ ] **Step 3: Hand the migration to the user for manual application**

Tell the user, verbatim:

> Apply `supabase/migrations/0008_admin_registration.sql` in the Supabase SQL editor (paste contents, Run). Then verify the guard by running `select public.set_registration_open(true);` in the SQL editor — it should **ERROR** with `only an admin can change registration` (because `auth.uid()` is null there). That error proves the guard works; the app calls it as the logged-in admin, where it succeeds.

Do not proceed to depend on this RPC at runtime until the user confirms it is applied. (Later tasks can still be written and type-checked without it.)

---

### Task 2: `phaseSteps` pure view helper

A pure function turning the current phase into an ordered, labelled step list for the phase banner. TDD with Vitest.

**Files:**
- Create: `lib/adminView.ts`
- Test: `lib/adminView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/adminView.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { phaseSteps } from "./adminView";

describe("phaseSteps", () => {
  it("marks the first phase current at registration, the rest upcoming", () => {
    const steps = phaseSteps("registration");
    expect(steps.map((s) => s.status)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(steps[0].label).toBe("Registration");
  });

  it("marks earlier phases done and the rest upcoming at a middle phase", () => {
    const steps = phaseSteps("group_locked");
    expect(steps.map((s) => s.status)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks every prior phase done with the last current at complete", () => {
    const steps = phaseSteps("complete");
    expect(steps.map((s) => s.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  it("returns six steps keyed by phase name", () => {
    const steps = phaseSteps("draft");
    expect(steps.map((s) => s.key)).toEqual([
      "registration",
      "draft",
      "group_locked",
      "knockout_realloc",
      "knockout_locked",
      "complete",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- adminView`
Expected: FAIL — cannot resolve `./adminView` / `phaseSteps` not defined.

- [ ] **Step 3: Write the implementation**

Create `lib/adminView.ts`:

```ts
// Pure view helper for the admin phase banner. Maps the game_config phase
// state machine to an ordered, labelled step list with done/current/upcoming
// status, so the banner can render the game's position at a glance.

export type GamePhase =
  | "registration"
  | "draft"
  | "group_locked"
  | "knockout_realloc"
  | "knockout_locked"
  | "complete";

export type PhaseStatus = "done" | "current" | "upcoming";

export interface PhaseStep {
  key: GamePhase;
  label: string;
  status: PhaseStatus;
}

const PHASE_ORDER: { key: GamePhase; label: string }[] = [
  { key: "registration", label: "Registration" },
  { key: "draft", label: "Draft" },
  { key: "group_locked", label: "Group stage" },
  { key: "knockout_realloc", label: "Knockout swap" },
  { key: "knockout_locked", label: "Knockouts" },
  { key: "complete", label: "Complete" },
];

export function phaseSteps(current: GamePhase): PhaseStep[] {
  const idx = PHASE_ORDER.findIndex((p) => p.key === current);
  return PHASE_ORDER.map((p, i) => ({
    key: p.key,
    label: p.label,
    status: i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- adminView`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/adminView.ts lib/adminView.test.ts
git commit -m "feat: add phaseSteps view helper for admin phase banner"
```

---

### Task 3: `ConfirmAction` reusable confirm-step component

A two-step client component: first click arms the action (reveals a Confirm/Cancel prompt naming the consequence); Confirm fires the wrapped server action. This is the safety mechanism behind every admin button. Presentational — no unit test (verified via build), consistent with other `components/draft/*` components.

**Files:**
- Create: `components/admin/ConfirmAction.tsx`

- [ ] **Step 1: Write the component**

Create `components/admin/ConfirmAction.tsx`:

```tsx
"use client";
import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";

// Two-step admin action button. First click "arms" it and reveals a
// Confirm/Cancel prompt naming the consequence; only Confirm submits the
// wrapped server action. Prevents accidental one-tap phase changes.
export default function ConfirmAction({
  action,
  label,
  pendingLabel,
  confirmPrompt,
  description,
  tone = "primary",
}: {
  action: () => Promise<void>;
  label: string;
  pendingLabel: string;
  confirmPrompt: string;
  description?: string;
  tone?: "primary" | "danger";
}) {
  const [armed, setArmed] = useState(false);

  const btn =
    tone === "danger"
      ? "border border-red-400 text-red-300 hover:bg-red-500 hover:text-white"
      : "bg-gold text-navy hover:brightness-110";

  if (!armed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setArmed(true)}
          className={`rounded-full px-5 py-2 text-sm font-bold transition ${btn}`}
        >
          {label}
        </button>
        {description && <p className="mt-2 text-xs text-caption">{description}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gold/50 bg-navy/40 p-3">
      <p className="text-sm text-bodytext">{confirmPrompt}</p>
      <div className="mt-3 flex gap-2">
        <form action={action}>
          <SubmitButton
            pendingLabel={pendingLabel}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${btn}`}
          >
            Confirm
          </SubmitButton>
        </form>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-full border border-glow px-4 py-2 text-sm text-caption"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/ConfirmAction.tsx
git commit -m "feat: add ConfirmAction two-step admin button component"
```

---

### Task 4: `PhaseBanner` component

Presentational banner rendering the `phaseSteps` output as a row of pills, the current phase highlighted. No unit test (verified via build).

**Files:**
- Create: `components/admin/PhaseBanner.tsx`

- [ ] **Step 1: Write the component**

Create `components/admin/PhaseBanner.tsx`:

```tsx
import type { PhaseStep } from "@/lib/adminView";

// Read-only orientation banner: the phase state machine as a row of pills,
// the current phase highlighted in gold, past phases dimmed, future faded.
export default function PhaseBanner({ steps }: { steps: PhaseStep[] }) {
  return (
    <section className="rounded-xl border border-glow bg-panel p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-caption">Current phase</h2>
      <ol className="mt-3 flex flex-wrap gap-2">
        {steps.map((s) => (
          <li
            key={s.key}
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              s.status === "current"
                ? "bg-gold text-navy"
                : s.status === "done"
                  ? "border border-glow text-caption"
                  : "border border-glow text-bodytext opacity-50",
            ].join(" ")}
          >
            {s.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/PhaseBanner.tsx
git commit -m "feat: add PhaseBanner component for admin page"
```

---

### Task 5: Admin server actions

The server actions the admin buttons call. Each wraps a Supabase RPC, revalidates `/admin`, and redirects back to `/admin` (or `/admin?error=...` on failure). Self-contained — does not import from other action files.

**Files:**
- Create: `app/(app)/admin/actions.ts`

- [ ] **Step 1: Write the actions file**

Create `app/(app)/admin/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// All admin actions return to /admin. On RPC error, surface the message in
// the page's error banner via the query string.
function back(error?: string): never {
  redirect(error ? `/admin?error=${encodeURIComponent(error)}` : "/admin");
}

async function call(rpc: string, args?: Record<string, unknown>): Promise<never> {
  const supabase = createClient();
  const { error } = await supabase.rpc(rpc, args);
  if (error) back(error.message);
  revalidatePath("/admin");
  back();
}

export async function openRegistration() {
  await call("set_registration_open", { p_open: true });
}

export async function closeRegistration() {
  await call("set_registration_open", { p_open: false });
}

export async function startDraft() {
  await call("start_draft");
}

export async function adminAutopick() {
  await call("admin_autopick");
}

export async function lockPredictions() {
  await call("lock_predictions");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/admin/actions.ts"
git commit -m "feat: add admin server actions for the control panel"
```

---

### Task 6: Admin page

The guarded `/admin` page tying it together: admin check, phase banner, and the action sections gated by phase / config flags.

**Files:**
- Create: `app/(app)/admin/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(app)/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { phaseSteps, type GamePhase } from "@/lib/adminView";
import PhaseBanner from "@/components/admin/PhaseBanner";
import ConfirmAction from "@/components/admin/ConfirmAction";
import {
  openRegistration,
  closeRegistration,
  startDraft,
  adminAutopick,
  lockPredictions,
} from "./actions";

export const dynamic = "force-dynamic"; // always reflect live game state

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) redirect("/home");

  const [{ data: cfg }, { data: draft }] = await Promise.all([
    supabase
      .from("game_config")
      .select("registration_open, predictions_open, predictions_locked_at")
      .eq("id", 1)
      .single(),
    supabase.rpc("draft_state"),
  ]);

  const state = draft as { phase: GamePhase; current_user_name: string | null } | null;
  const phase: GamePhase = state?.phase ?? "registration";
  const registrationOpen = cfg?.registration_open ?? false;
  const predictionsOpen = cfg?.predictions_open ?? false;
  const currentPlayer = state?.current_user_name ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin control panel</h1>
        <a href="/home" className="text-sm text-caption underline">
          ← Home
        </a>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}

      <PhaseBanner steps={phaseSteps(phase)} />

      {phase === "registration" && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Registration</h2>
          {registrationOpen ? (
            <ConfirmAction
              action={closeRegistration}
              tone="danger"
              label="Close registration"
              pendingLabel="Closing…"
              confirmPrompt="Close registration so no new players can join. Confirm?"
              description="Hides the join CTA on the landing page."
            />
          ) : (
            <ConfirmAction
              action={openRegistration}
              label="Open registration"
              pendingLabel="Opening…"
              confirmPrompt="Open registration so friends can join. Confirm?"
              description="Shows the join CTA on the landing page."
            />
          )}
        </section>
      )}

      {phase === "registration" && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Draft</h2>
          <ConfirmAction
            action={startDraft}
            label="Start draft"
            pendingLabel="Starting…"
            confirmPrompt="Start the draft — randomises pick order, closes registration, and opens bonus predictions. Can't be undone. Confirm?"
            description="Randomises order; closes registration; opens predictions."
          />
        </section>
      )}

      {phase === "draft" && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Draft</h2>
          <ConfirmAction
            action={adminAutopick}
            tone="danger"
            label={`Auto-pick for ${currentPlayer ?? "current player"}`}
            pendingLabel="Picking…"
            confirmPrompt={`Assign a random available team to ${currentPlayer ?? "the current player"}? Use only after nudging them. Confirm?`}
            description="Assigns a random team to the player on the clock."
          />
        </section>
      )}

      {predictionsOpen && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Predictions</h2>
          <ConfirmAction
            action={lockPredictions}
            tone="danger"
            label="Lock predictions"
            pendingLabel="Locking…"
            confirmPrompt="Lock predictions — closes the window and reveals everyone's picks. Can't be undone. Confirm?"
            description="Closes the window and reveals all picks."
          />
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build to verify the route compiles**

Run: `npm run build`
Expected: build succeeds; `/admin` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/page.tsx"
git commit -m "feat: add guarded /admin control-panel page"
```

---

### Task 7: Remove admin controls from home; add the admin link; delete the old draft admin actions

Strips admin buttons off the home dashboard, adds an admin-only "⚙ Admin" link, deletes the now-unused `AdminControls` component, and removes the relocated `startDraft` / `adminAutopick` actions from `draft/actions.ts`. Done together so no import breaks between commits.

**Files:**
- Modify: `app/(app)/home/page.tsx`
- Delete: `components/draft/AdminControls.tsx`
- Modify: `app/(app)/draft/actions.ts`

- [ ] **Step 1: Remove the `AdminControls` import from the home page**

In `app/(app)/home/page.tsx`, delete this line:

```tsx
import AdminControls from "@/components/draft/AdminControls";
```

- [ ] **Step 2: Replace the admin controls block with an admin link**

In `app/(app)/home/page.tsx`, find:

```tsx
      {state?.is_admin && (
        <AdminControls phase={phase} currentUserName={state?.current_user_name ?? null} />
      )}
```

Replace it with:

```tsx
      {state?.is_admin && (
        <a
          href="/admin"
          className="inline-block self-start rounded-full border border-gold/60 px-4 py-2 text-sm font-bold text-gold transition hover:bg-gold hover:text-navy"
        >
          ⚙ Admin
        </a>
      )}
```

- [ ] **Step 3: Delete the unused `AdminControls` component**

```bash
git rm "components/draft/AdminControls.tsx"
```

- [ ] **Step 4: Remove the relocated actions from `draft/actions.ts`**

In `app/(app)/draft/actions.ts`, delete the `startDraft` function:

```tsx
export async function startDraft() {
  const supabase = createClient();
  const { error } = await supabase.rpc("start_draft");
  if (error) backWithError(error.message);
  revalidatePath("/home");
  redirect("/home");
}
```

and delete the `adminAutopick` function:

```tsx
export async function adminAutopick() {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_autopick");
  if (error) backWithError(error.message);
  revalidatePath("/home");
  redirect("/home");
}
```

Leave `backWithError` and `makePick` intact (`makePick` still uses `backWithError`).

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds. (Confirms nothing else imported `AdminControls`, `startDraft`, or `adminAutopick`.)

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/home/page.tsx" "app/(app)/draft/actions.ts"
git commit -m "refactor: move admin controls off home to /admin, add admin link"
```

---

### Task 8: Remove the lock-predictions admin button from the predictions page

Moves the last admin button to `/admin`: removes the admin lock form and `isAdmin` plumbing from the predictions surface. Friends keep their Save button.

**Files:**
- Modify: `components/predictions/PredictionForm.tsx`
- Modify: `app/(app)/predictions/page.tsx`
- Modify: `app/(app)/predictions/actions.ts`

- [ ] **Step 1: Strip the admin form and `isAdmin` from `PredictionForm`**

Replace the entire contents of `components/predictions/PredictionForm.tsx` with:

```tsx
import { savePredictions } from "@/app/(app)/predictions/actions";
import SubmitButton from "@/components/SubmitButton";

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
}: {
  categories: Category[];
  teams: Team[];
  picksByKey: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <form action={savePredictions} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-full bg-gold px-6 py-3 font-bold text-navy transition hover:brightness-110"
        >
          Save predictions
        </SubmitButton>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Stop fetching/passing `isAdmin` in the predictions page**

In `app/(app)/predictions/page.tsx`:

Remove the `me` profile fetch from the `Promise.all` — delete this line:

```tsx
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
```

and remove `{ data: me }` from the destructuring array so the remaining destructure reads:

```tsx
  const [
    { data: cfg },
    { data: categories },
    { data: teams },
    { data: picks },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("game_config").select("predictions_open, predictions_locked_at").eq("id", 1).single(),
    supabase.from("bonus_categories").select("id, key, name").eq("is_active", true).order("name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("bonus_predictions").select("user_id, category_id, pick_slot, pick_value"),
    supabase.from("profiles").select("id, display_name"),
  ]);
```

Delete this line:

```tsx
  const isAdmin = me?.is_admin ?? false;
```

Change the `PredictionForm` usage from:

```tsx
        <PredictionForm categories={cats} teams={teams ?? []} picksByKey={picksByKey} isAdmin={isAdmin} />
```

to:

```tsx
        <PredictionForm categories={cats} teams={teams ?? []} picksByKey={picksByKey} />
```

- [ ] **Step 3: Remove `lockPredictions` from `predictions/actions.ts`**

In `app/(app)/predictions/actions.ts`, delete the `lockPredictions` function:

```tsx
export async function lockPredictions() {
  const supabase = createClient();
  const { error } = await supabase.rpc("lock_predictions");
  if (error) redirect(`/predictions?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/predictions");
  redirect("/predictions");
}
```

Leave `savePredictions` intact.

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds. (Confirms nothing else imported `lockPredictions` or passed `isAdmin`.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including the new `adminView` tests).

- [ ] **Step 6: Commit**

```bash
git add "components/predictions/PredictionForm.tsx" "app/(app)/predictions/page.tsx" "app/(app)/predictions/actions.ts"
git commit -m "refactor: move lock-predictions admin button to /admin"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all green (includes `adminView`).
- [ ] `npm run build` — succeeds; `/admin` listed in routes.
- [ ] Manual smoke (once migration `0008` is applied): log in as admin (`ryban3z`) → home shows "⚙ Admin" link → `/admin` shows the phase banner + Open registration / Start draft. Log in as a non-admin → visiting `/admin` redirects to `/home`, and no "⚙ Admin" link appears. Confirm each button requires a second Confirm click before firing.
- [ ] Home and predictions pages show **no** admin buttons.
