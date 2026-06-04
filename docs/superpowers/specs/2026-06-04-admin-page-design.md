# Admin Control Panel — Design

**Date:** 2026-06-04
**Status:** Approved (ready for implementation plan)

## Problem

Admin-only, state-changing buttons currently live on pages that all friends use:

- **Start draft** (`start_draft`) and **Auto-pick** (`admin_autopick`) — on the home dashboard (`AdminControls`).
- **Lock predictions** (`lock_predictions`) — on the predictions page (`PredictionForm`).
- **Open registration** (`game_config.registration_open`) — no UI at all; run manually in the Supabase SQL editor.

These one-way phase transitions sit one tap away from normal use, risking an accidental, irreversible change (e.g. starting the draft early). The admin also has to drop to SQL to open registration.

## Goal

A single, access-controlled `/admin` page that consolidates every pre-tournament admin action behind confirm steps, and removes all admin buttons from the pages friends use.

## Scope

**In scope:** the full pre-tournament phase machine — registration, draft, predictions.

**Out of scope (deferred):** knockout-phase transitions (`group_locked → knockout_realloc → knockout_locked → complete`). No RPCs exist for these yet; not needed until ~late June. A future admin-page iteration adds them.

## Route & access

- New route: `app/(app)/admin/page.tsx`, inside the existing gated `(app)` route group. It therefore already requires the site-password gate cookie **and** a logged-in Supabase session (enforced by `middleware.ts`).
- **Server-side admin guard:** the page (a server component) reads `profiles.is_admin` for `auth.uid()`. If false or unauthenticated, it `redirect("/home")` before rendering. No admin markup is ever sent to a non-admin — no flicker, no exposed actions.
- **Discoverability:** the home dashboard renders a small "⚙ Admin" link **only when the current user is an admin**. Non-admins never see the link and cannot reach the page.

## Page contents (top to bottom)

1. **Current phase** — a read-only banner showing the state-machine position
   (`registration → draft → group_locked → knockout_realloc → knockout_locked → complete`),
   with the active phase highlighted. Always-visible orientation before any action.

2. **Registration** — an **Open registration** / **Close registration** toggle button
   reflecting `game_config.registration_open`. Replaces the manual SQL step.
   Only meaningful in the `registration` phase (the toggle is shown there; hidden once
   the draft has started).

3. **Draft** —
   - **Start draft** button, shown when `current_phase = 'registration'`.
     Calls `start_draft()` (randomises pick order, closes registration, opens the
     prediction window, moves to `draft`).
   - **Auto-pick for {current player}** button, shown when `current_phase = 'draft'`.
     Calls `admin_autopick()`.

4. **Predictions** — **Lock predictions** button, shown while `predictions_open = true`.
   Calls `lock_predictions()`. Moved here entirely from the predictions page.

## Safety: confirm step on every action

Every state-changing button requires an explicit confirm before firing — a two-step
interaction (click reveals a "Confirm / Cancel" inline prompt naming the consequence,
e.g. *"Start draft — this closes registration and opens predictions. Confirm?"*).
No admin action fires on a single tap. This is the core requirement.

## New backend

One small migration adds an admin-guarded setter for the registration flag (the column
already exists from `0004`; only a safe setter is missing):

```sql
-- set_registration_open(p_open boolean): admin-only toggle of game_config.registration_open
create or replace function public.set_registration_open(p_open boolean)
returns void
language plpgsql
security definer
set search_path = public
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

No other backend changes — `start_draft`, `admin_autopick`, `lock_predictions` already exist
and are admin/phase-guarded server-side, so the page is a thin, safer front door to them.

## Cleanup of existing surfaces

- **Remove** `<AdminControls />` from `app/(app)/home/page.tsx` (component may be deleted or
  repurposed into the admin page).
- **Remove** the admin **Lock predictions** form from `components/predictions/PredictionForm.tsx`.
  Friends keep their **Save** button; only the admin lock relocates.
- Net effect: home and predictions pages carry **zero admin buttons**.

## Testing

- Unit-test any new pure view helper (e.g. a phase-list/“current phase” formatter) with Vitest,
  matching the existing `lib/*View.ts` + Vitest pattern.
- The `set_registration_open` RPC is exercised by an admin-guard check (non-admin call raises).
- Manual: log in as admin → `/admin` shows controls; log in as non-admin → `/admin` redirects to
  `/home` and no "⚙ Admin" link is shown.

## Server actions

The page's buttons call server actions (`"use server"`) wrapping the RPCs, mirroring the existing
`app/(app)/draft/actions.ts` / `app/(app)/predictions/actions.ts` pattern, then `revalidatePath`
the relevant routes so phase changes reflect immediately.
