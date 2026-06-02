# Pre-Tournament Foundation & Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the core-app foundation — Supabase schema + RLS, seeded teams/categories, a shared-password gate, and Supabase email/password auth — so the ~8 friends can get past the gate and create accounts.

**Architecture:** Next.js 14 App Router on the existing repo. A thin shared-password gate (env `SITE_PASSWORD` → signed httpOnly cookie checked in middleware) sits in front of Supabase Auth (real per-user accounts). Postgres holds all state; the full canonical DDL is applied as migrations with RLS enabled on every table (deny-by-default) and explicit policies only for the tables this slice uses. Branding + the gate password come from env so a second group is just a separate deploy. Teams are seeded from the public-domain openfootball dataset.

**Tech Stack:** Next.js 14.2.35, TypeScript (strict), `@supabase/supabase-js` + `@supabase/ssr`, Vitest, Tailwind, Vercel + Supabase (free tiers).

**Source of truth:** `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` (data model, phases, visibility rules).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/config.ts` + `lib/config.test.ts` | Pure branding/config reader (pool name, trophy, kickoff) from env, with validation. |
| `lib/gate.ts` + `lib/gate.test.ts` | Pure `checkSitePassword` (constant-time compare) + gate cookie name/constants. |
| `lib/supabase/server.ts` | Server-side Supabase client (cookie-bound, for Server Components / Actions / Route Handlers). |
| `lib/supabase/client.ts` | Browser Supabase client. |
| `lib/supabase/middleware.ts` | Session-refresh helper used by `middleware.ts`. |
| `middleware.ts` | Enforces the gate cookie + refreshes the Supabase session on every request. |
| `supabase/migrations/0001_initial_schema.sql` | Full canonical DDL (enums, tables, indexes) + `handle_new_user` trigger. |
| `supabase/migrations/0002_rls_policies.sql` | `enable row level security` on all tables; explicit policies for `profiles`, `teams`, `game_config`, `bonus_categories`. |
| `supabase/seed/0003_seed_config_categories.sql` | Seed `game_config` (single row) + 5 `bonus_categories`. |
| `scripts/generate-teams-seed.mjs` | Fetches openfootball 2026 JSON → emits `supabase/seed/teams.generated.sql` (48 teams w/ group + flag). |
| `scripts/country-iso.json` | Country-name → ISO2 lookup (drives flag URLs); completeness enforced by the generator. |
| `app/gate/page.tsx` + `app/gate/actions.ts` | Password entry form + server action that sets the gate cookie. |
| `app/(auth)/register/page.tsx` + `app/(auth)/login/page.tsx` + `app/(auth)/actions.ts` | Registration (display name + email/password) and login/signout server actions. |
| `app/(app)/home/page.tsx` | Minimal authed landing (proves the gate→auth→session chain). |
| `.env.local.example` | Documents every env var the app needs. |

**Note on TDD fit:** Pure logic (`config`, `gate`) is built test-first. SQL migrations, RLS, Supabase auth wiring, and middleware are infrastructure — they get an **apply + explicit verification** step (a SQL smoke check or a manual browser check with expected output) instead of a unit test, because unit tests can't meaningfully exercise them. This is deliberate, not a shortcut.

---

## Task 0: Dependencies & env scaffolding

**Files:**
- Modify: `package.json`
- Create: `.env.local.example`

- [ ] **Step 1: Install Supabase libraries**

Run:
```bash
npm install @supabase/supabase-js@^2 @supabase/ssr@^0.5
```
Expected: `package.json` dependencies now include both packages; `npm install` exits 0.

- [ ] **Step 2: Create `.env.local.example`**

```bash
# ---- Supabase (from your project's API settings) ----
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon public key>"
SUPABASE_SERVICE_ROLE_KEY="<service role key — server only, NEVER expose>"

# ---- Shared site-password gate ----
SITE_PASSWORD="<the password you hand to friends>"
GATE_TOKEN="<long random string, e.g. `openssl rand -hex 32`>"

# ---- Branding (per-deploy; lets a second group rebrand without code) ----
NEXT_PUBLIC_POOL_NAME="Gami All-Stars"
NEXT_PUBLIC_TROPHY_NAME="The Golden Drumstick"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: add supabase deps and env template"
```

---

## Task 1: Branding config (TDD)

**Files:**
- Create: `lib/config.ts`
- Test: `lib/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/config.test.ts
import { describe, it, expect } from "vitest";
import { getBranding } from "@/lib/config";

describe("getBranding", () => {
  it("reads pool and trophy names from env", () => {
    const b = getBranding({
      NEXT_PUBLIC_POOL_NAME: "Gami All-Stars",
      NEXT_PUBLIC_TROPHY_NAME: "The Golden Drumstick",
    });
    expect(b.poolName).toBe("Gami All-Stars");
    expect(b.trophyName).toBe("The Golden Drumstick");
  });

  it("falls back to sensible defaults when env is missing", () => {
    const b = getBranding({});
    expect(b.poolName).toBe("World Cup Pool");
    expect(b.trophyName).toBe("The Trophy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — `getBranding` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/config.ts
export interface Branding {
  poolName: string;
  trophyName: string;
}

/** Pure reader so branding is per-deploy (separate-deploy multi-group model). */
export function getBranding(
  env: Partial<Record<string, string | undefined>>,
): Branding {
  return {
    poolName: env.NEXT_PUBLIC_POOL_NAME || "World Cup Pool",
    trophyName: env.NEXT_PUBLIC_TROPHY_NAME || "The Trophy",
  };
}

/** Convenience for components: reads from the real environment. */
export const branding = getBranding(process.env);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat: add env-driven branding config"
```

---

## Task 2: Gate password check (TDD)

**Files:**
- Create: `lib/gate.ts`
- Test: `lib/gate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/gate.test.ts
import { describe, it, expect } from "vitest";
import { checkSitePassword, GATE_COOKIE } from "@/lib/gate";

describe("checkSitePassword", () => {
  it("accepts the exact password", () => {
    expect(checkSitePassword("hunter2", "hunter2")).toBe(true);
  });
  it("rejects a wrong password", () => {
    expect(checkSitePassword("nope", "hunter2")).toBe(false);
  });
  it("rejects when no password is configured", () => {
    expect(checkSitePassword("anything", undefined)).toBe(false);
    expect(checkSitePassword("anything", "")).toBe(false);
  });
  it("is length-safe (different lengths return false, no throw)", () => {
    expect(checkSitePassword("short", "muchlongerpassword")).toBe(false);
  });
  it("exposes a stable cookie name", () => {
    expect(GATE_COOKIE).toBe("gami_gate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/gate.ts
export const GATE_COOKIE = "gami_gate";

/**
 * Constant-time-ish comparison of the submitted password to the configured one.
 * Runs in a Node (server action) context. Returns false if no password is set.
 */
export function checkSitePassword(
  input: string,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/gate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/gate.ts lib/gate.test.ts
git commit -m "feat: add shared-password gate check"
```

---

## Task 3: Supabase clients

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/middleware.ts`

No unit test (thin SDK wiring; exercised by Task 7's manual auth check).

- [ ] **Step 1: Browser client**

```ts
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Server client (cookie-bound)**

```ts
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (read-only cookies); safe to ignore —
            // middleware refreshes the session.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Middleware session helper**

```ts
// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the user so the session token refreshes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors from these files.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase
git commit -m "feat: add supabase browser/server/middleware clients"
```

---

## Task 4: Schema migration (full canonical DDL + new-user trigger)

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`

This is infrastructure: write the SQL, apply it to the Supabase project, then verify by querying the catalog. No unit test.

- [ ] **Step 1: Write the migration**

Copy the canonical DDL verbatim from the spec's Data Model section (`docs/superpowers/specs/2026-05-28-world-cup-pool-design.md`, the full ```sql block — enums, `profiles`, `teams`, `game_config`, `team_ownership`, `swap_nominations`, `bonus_categories`, `bonus_predictions`, `matches`, `team_standings`, `scoring_rules` + its inserts, `scoring_config` + its insert, `scores`). Save it as the top of this file, then append the new-user trigger below:

```sql
-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
-- display_name is passed at signUp via options.data.display_name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Apply to the Supabase project**

Prereq (one-time, done by the user/admin): create a free project at https://supabase.com/dashboard, then put its URL + anon + service-role keys into `.env.local`.

Apply by pasting the file's contents into the Supabase dashboard **SQL Editor → New query → Run**. (CLI alternative: `supabase db push` if the Supabase CLI is set up — not required.)
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify the tables exist**

In the SQL Editor, run:
```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```
Expected rows include: `bonus_categories`, `bonus_predictions`, `game_config`, `matches`, `profiles`, `scores`, `scoring_config`, `scoring_rules`, `swap_nominations`, `team_ownership`, `team_standings`, `teams`.

Then verify the seed inserts that ship inside the DDL:
```sql
select count(*) from scoring_rules;   -- expect 5
select group_qualify_pts, bonus_correct_pts, champion_pts from scoring_config; -- 5, 8, 12
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_initial_schema.sql
git commit -m "feat: add initial postgres schema + new-user trigger"
```

---

## Task 5: RLS policies

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`

Visibility rule from the spec: a row is readable by its owner always, and by everyone once `game_config.current_phase` has advanced past the phase that produced it. This slice only needs read access to reference data (`teams`, `game_config`, `bonus_categories`) plus self-access to `profiles`. RLS is **enabled on every table** so nothing is exposed by default; per-feature write/visibility policies for `team_ownership` and `bonus_predictions` come in Plans 2 & 3.

- [ ] **Step 1: Write the policies**

```sql
-- Enable RLS on every table (deny-by-default until a policy grants access).
alter table profiles          enable row level security;
alter table teams             enable row level security;
alter table game_config       enable row level security;
alter table team_ownership    enable row level security;
alter table swap_nominations  enable row level security;
alter table bonus_categories  enable row level security;
alter table bonus_predictions enable row level security;
alter table matches           enable row level security;
alter table team_standings    enable row level security;
alter table scoring_rules     enable row level security;
alter table scoring_config    enable row level security;
alter table scores            enable row level security;

-- Reference data: any authenticated user may read.
create policy "auth read teams"            on teams            for select to authenticated using (true);
create policy "auth read game_config"      on game_config      for select to authenticated using (true);
create policy "auth read bonus_categories" on bonus_categories for select to authenticated using (true);
create policy "auth read scoring_rules"    on scoring_rules    for select to authenticated using (true);
create policy "auth read scoring_config"   on scoring_config   for select to authenticated using (true);

-- Profiles: a user reads everyone's display name (needed for leaderboard/draft),
-- but may only update their own row; inserts happen via the security-definer trigger.
create policy "auth read profiles"   on profiles for select to authenticated using (true);
create policy "update own profile"   on profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
```

- [ ] **Step 2: Apply** — paste into SQL Editor → Run. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS is on everywhere**

```sql
select relname, relrowsecurity from pg_class
where relkind = 'r' and relnamespace = 'public'::regnamespace order by relname;
```
Expected: `relrowsecurity = true` for all 12 tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat: enable RLS + read policies for reference data"
```

---

## Task 6: Seed config, categories, and teams

**Files:**
- Create: `supabase/seed/0003_seed_config_categories.sql`
- Create: `scripts/country-iso.json`
- Create: `scripts/generate-teams-seed.mjs`
- Generated: `supabase/seed/teams.generated.sql`

- [ ] **Step 1: Seed game_config + bonus categories**

```sql
-- supabase/seed/0003_seed_config_categories.sql
insert into game_config (id, current_phase) values (1, 'registration')
on conflict (id) do nothing;

insert into bonus_categories (key, name) values
  ('golden_boot',  'Golden Boot — Top Scorer'),
  ('golden_ball',  'Golden Ball — Best Player'),
  ('golden_glove', 'Golden Glove — Best Goalkeeper'),
  ('young_player',  'Best Young Player'),
  ('tournament_winner', 'Tournament Winner')
on conflict (key) do nothing;
```
Apply via SQL Editor. Verify:
```sql
select count(*) from bonus_categories;          -- expect 5
select current_phase from game_config where id = 1; -- 'registration'
```

- [ ] **Step 2: Create the country→ISO2 lookup (drives flag URLs)**

```json
// scripts/country-iso.json — extend until the generator reports 0 unmapped.
{
  "Mexico": "mx",
  "South Africa": "za",
  "South Korea": "kr",
  "Czech Republic": "cz",
  "Brazil": "br",
  "Scotland": "gb-sct",
  "England": "gb-eng",
  "Wales": "gb-wls",
  "United States": "us",
  "Canada": "ca",
  "Argentina": "ar",
  "France": "fr",
  "Spain": "es",
  "Germany": "de",
  "Portugal": "pt",
  "Netherlands": "nl",
  "Belgium": "be",
  "Croatia": "hr",
  "Japan": "jp",
  "Australia": "au",
  "Morocco": "ma",
  "Senegal": "sn",
  "Uruguay": "uy",
  "Colombia": "co"
}
```
(This starter list is intentionally incomplete; the generator in Step 3 **fails loudly** listing any team name it can't map, so completing it is a verified, finite task — not a guess.)

- [ ] **Step 3: Write the teams-seed generator**

```js
// scripts/generate-teams-seed.mjs
// Fetches the public-domain openfootball 2026 dataset (proven live, no key),
// derives the 48 distinct teams + their group letter, and emits idempotent SQL.
import { readFile, writeFile } from "node:fs/promises";

const SRC =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const OUT = "supabase/seed/teams.generated.sql";

const iso = JSON.parse(await readFile("scripts/country-iso.json", "utf8"));

const res = await fetch(SRC);
if (!res.ok) throw new Error(`openfootball fetch failed: ${res.status}`);
const data = await res.json();

// Group-stage matches carry "group": "Group A".. and team1/team2 names.
const teams = new Map(); // name -> group letter
for (const m of data.matches) {
  const g = (m.group || "").replace(/^Group\s+/i, "").trim();
  if (!g || g.length > 2) continue; // skip knockout rounds
  for (const name of [m.team1, m.team2]) {
    if (name && !teams.has(name)) teams.set(name, g);
  }
}

const unmapped = [...teams.keys()].filter((n) => !iso[n]);
if (unmapped.length) {
  console.error("Unmapped team names (add to scripts/country-iso.json):");
  unmapped.forEach((n) => console.error("  - " + n));
  process.exit(1);
}

const rows = [...teams.entries()]
  .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
  .map(([name, g]) => {
    const code = iso[name];
    const flag = `https://flagcdn.com/w80/${code}.png`;
    const esc = (s) => s.replace(/'/g, "''");
    return `  ('${esc(name)}', '${g}', '${esc(flag)}')`;
  });

const sql = `-- GENERATED by scripts/generate-teams-seed.mjs — do not edit by hand.
insert into teams (name, group_letter, flag_url) values
${rows.join(",\n")}
on conflict do nothing;
`;

await writeFile(OUT, sql);
console.log(`Wrote ${rows.length} teams to ${OUT}`);
```

- [ ] **Step 4: Run the generator and confirm 48 teams**

Run: `node scripts/generate-teams-seed.mjs`
Expected: either it prints unmapped names (→ add them to `country-iso.json` and re-run) or prints `Wrote 48 teams to supabase/seed/teams.generated.sql`.

- [ ] **Step 5: Apply the generated SQL + verify**

Paste `supabase/seed/teams.generated.sql` into the SQL Editor → Run. Then:
```sql
select count(*) from teams;                                  -- expect 48
select count(distinct group_letter) from teams;              -- expect 12
select group_letter, count(*) from teams group by 1 order by 1; -- each group = 4
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed scripts/country-iso.json scripts/generate-teams-seed.mjs
git commit -m "feat: seed game_config, bonus categories, and 48 teams"
```

---

## Task 7: Gate page + middleware enforcement

**Files:**
- Create: `app/gate/page.tsx`
- Create: `app/gate/actions.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Gate server action**

```ts
// app/gate/actions.ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkSitePassword, GATE_COOKIE } from "@/lib/gate";

export async function submitGate(formData: FormData) {
  const input = String(formData.get("password") ?? "");
  if (!checkSitePassword(input, process.env.SITE_PASSWORD)) {
    redirect("/gate?error=1");
  }
  cookies().set(GATE_COOKIE, process.env.GATE_TOKEN!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 days
  });
  redirect("/login");
}
```

- [ ] **Step 2: Gate page**

```tsx
// app/gate/page.tsx
import { branding } from "@/lib/config";
import { submitGate } from "./actions";

export default function GatePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{branding.poolName}</h1>
      <p className="text-sm opacity-80">Enter the password to continue.</p>
      <form action={submitGate} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="rounded border p-3"
          placeholder="Password"
        />
        {searchParams.error && (
          <p className="text-sm text-red-500">Wrong password — try again.</p>
        )}
        <button className="rounded bg-black p-3 text-white">Enter</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Middleware (gate + session)**

```ts
// middleware.ts
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { GATE_COOKIE } from "@/lib/gate";

const PUBLIC_PATHS = ["/gate"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Gate: everything except /gate and static assets requires the gate cookie.
  const gated =
    request.cookies.get(GATE_COOKIE)?.value === process.env.GATE_TOKEN;
  if (!gated && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/gate", request.url));
  }

  // 2) Refresh the Supabase session and gate /(app) routes behind auth.
  const { response, user } = await updateSession(request);
  const isAuthArea =
    pathname.startsWith("/home") || pathname.startsWith("/(app)");
  if (gated && isAuthArea && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open http://localhost:3000 → expect redirect to `/gate`. Submit a wrong password → expect "Wrong password". Submit the `SITE_PASSWORD` value → expect redirect to `/login`. (Use the preview tools: `preview_start`, `preview_snapshot`, `preview_fill`, `preview_screenshot`.)

- [ ] **Step 5: Commit**

```bash
git add app/gate middleware.ts
git commit -m "feat: shared-password gate + middleware enforcement"
```

---

## Task 8: Auth — register, login, signout, authed shell

**Files:**
- Create: `app/(auth)/actions.ts`
- Create: `app/(auth)/register/page.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(app)/home/page.tsx`

- [ ] **Step 1: Auth server actions**

```ts
// app/(auth)/actions.ts
"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function register(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) redirect("/register?error=Display+name+required");

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  // Unique display_name violation surfaces from the trigger as an error here.
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  redirect("/home");
}

export async function login(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/home");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Register page**

```tsx
// app/(auth)/register/page.tsx
import { register } from "../actions";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <form action={register} className="flex flex-col gap-3">
        <input name="display_name" required placeholder="Display name" className="rounded border p-3" />
        <input name="email" type="email" required placeholder="Email" className="rounded border p-3" />
        <input name="password" type="password" required placeholder="Password" className="rounded border p-3" />
        {searchParams.error && <p className="text-sm text-red-500">{searchParams.error}</p>}
        <button className="rounded bg-black p-3 text-white">Register</button>
      </form>
      <a href="/login" className="text-sm underline">Already have an account? Log in</a>
    </main>
  );
}
```

- [ ] **Step 3: Login page**

```tsx
// app/(auth)/login/page.tsx
import { login } from "../actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Log in</h1>
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email" className="rounded border p-3" />
        <input name="password" type="password" required placeholder="Password" className="rounded border p-3" />
        {searchParams.error && <p className="text-sm text-red-500">{searchParams.error}</p>}
        <button className="rounded bg-black p-3 text-white">Log in</button>
      </form>
      <a href="/register" className="text-sm underline">Need an account? Register</a>
    </main>
  );
}
```

- [ ] **Step 4: Authed home shell**

```tsx
// app/(app)/home/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { signOut } from "../../(auth)/actions";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{branding.poolName}</h1>
      <p>
        Welcome, <strong>{profile?.display_name ?? "player"}</strong>. The draft
        hasn&apos;t opened yet — sit tight.
      </p>
      <form action={signOut}>
        <button className="text-sm underline">Sign out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Configure Supabase Auth for the flow**

In the Supabase dashboard → Authentication → Providers → Email: for the private-pool flow, **disable "Confirm email"** (so friends can register and use the app immediately without an SMTP setup). Note this in the README. Expected: email/password signups become active immediately.

- [ ] **Step 6: Verify the full chain in the browser**

Run `npm run dev`. From a clean state: `/` → `/gate` → enter password → `/login` → click Register → fill display name + email + password → land on `/home` showing the display name. Then check Supabase dashboard → Table Editor → `profiles`: a row exists with the display name and the matching `auth.users` id. Try registering a second account with the **same display name** → expect the unique-violation error surfaced on the register page. Use preview tools and capture a screenshot of `/home`.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)" "app/(app)"
git commit -m "feat: registration, login, signout, and authed home"
```

---

## Task 9: Deploy config + docs

**Files:**
- Modify: `CLAUDE.md` (status line)
- Create/modify: `README.md` (setup steps)

- [ ] **Step 1: Set Vercel env vars**

In the Vercel project → Settings → Environment Variables, add all keys from `.env.local.example` with production values (Supabase URL/keys, `SITE_PASSWORD`, `GATE_TOKEN`, `NEXT_PUBLIC_POOL_NAME`, `NEXT_PUBLIC_TROPHY_NAME`). Redeploy.

- [ ] **Step 2: Smoke-test production**

Visit the deployed URL → expect the gate. Enter the password → register a test account → reach `/home`. Then delete the test user from Supabase dashboard → Authentication → Users.

- [ ] **Step 3: Document setup in README**

Add a "Core app setup" section: required env vars, how to apply migrations (SQL Editor), how to run the teams generator, and the "disable Confirm email" note. Keep it short.

- [ ] **Step 4: Update CLAUDE.md status**

Change the "core app not yet built" line to note the foundation (gate + auth + schema) is built; draft and predictions are next (Plans 2 & 3).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: core-app setup steps and status update"
```

---

## Self-Review notes (author)

- **Spec coverage (this slice):** Access & Registration ✓ (gate + Supabase auth + display name). Visibility rules — partial: RLS enabled everywhere + reference-data + profile policies; `team_ownership`/`bonus_predictions` visibility lands in Plans 2 & 3 (those tables are deny-all until then, which is safe). Data model ✓ (full DDL applied in Task 4). Branding/multi-deploy ✓ (Task 1, env vars). Seeding ✓ (Task 6). Scoring/draft/knockout: intentionally out of scope for this plan.
- **Type consistency:** `createClient()` name is shared across `lib/supabase/{server,client}.ts` but imported from distinct paths per context; `GATE_COOKIE`/`checkSitePassword`/`getBranding`/`branding` names are consistent across all references.
- **Known follow-ups for Plan 2:** admin bootstrap (manually set `profiles.is_admin = true` for the organiser via SQL — add as Plan 2, Task 1); draft order + snake logic; `team_ownership` write/visibility RLS keyed off `current_phase`.
```
