# Gami World Cup '26 Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a public, mobile-first Next.js landing page ("Gami World Cup '26") that explains the pool, shows the rules/scoring, and counts down to kickoff (11 June 2026).

**Architecture:** Next.js 14 App Router, manually scaffolded into this existing repo (which already contains `docs/`, `scripts/`, `.git`). One static route (`app/page.tsx`) composed of focused, mostly server-rendered section components. The only client component is the live countdown, whose date math is a pure, unit-tested function. Content (steps, scoring rows, timeline) lives in typed data modules so it's trivial to tweak. Styling via Tailwind with a custom "Stadium Night" theme.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Vitest (for the countdown logic), deployed on Vercel.

---

## File Structure

```
package.json                 # deps + scripts
tsconfig.json                # TS config (Next defaults + @/* alias)
next.config.mjs              # Next config (minimal)
postcss.config.mjs           # Tailwind/PostCSS
tailwind.config.ts           # Stadium Night theme tokens
vitest.config.ts             # Vitest (node env) for lib tests
app/
  globals.css                # Tailwind directives + base body styles
  layout.tsx                 # <html>, metadata/OG, global background
  page.tsx                   # composes the five sections
components/
  Hero.tsx                   # server: title, tagline, host nations; renders <Countdown/>
  Countdown.tsx              # client: ticking countdown using lib/countdown
  HowItWorks.tsx             # server: 4 numbered steps
  Scoring.tsx                # server: scoring table panel
  Timeline.tsx               # server: "the road ahead"
  SiteFooter.tsx             # server: feedback CTA
lib/
  countdown.ts               # pure getCountdown(now, target) + KICKOFF constant
  countdown.test.ts          # Vitest unit tests (TDD)
  content.ts                 # typed arrays: steps, scoringRows, timelineItems, hostNations
```

**Responsibilities:** `lib/` holds all logic/data (no JSX). `components/` holds presentation, one section per file. `app/` wires it together. The split keeps each file small and single-purpose.

---

## Task 1: Scaffold the Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`
- Create: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gami-world-cup-2026",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "10.4.19",
    "postcss": "8.4.39",
    "tailwindcss": "3.4.6",
    "typescript": "5.5.3",
    "vitest": "2.0.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 4: Create `postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create `tailwind.config.ts` with the Stadium Night theme**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0a0e27",
        panel: "#11183a",
        glow: "#1c2a5e",
        neon: "#00ff9d",
        bodytext: "#9fb0d8",
        caption: "#6b7aa3",
        footer: "#070a1d",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 6: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0a0e27;
  color: #ffffff;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 7: Create `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gami World Cup '26",
  description:
    "The Gami All-Stars World Cup 2026 friends pool — snake-draft 48 nations, bonus predictions, and the race for the Golden Drumstick.",
  openGraph: {
    title: "Gami World Cup '26",
    description:
      "8 mates, 48 nations, one Golden Drumstick. Snake-draft pool for World Cup 2026.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create a temporary `app/page.tsx` placeholder**

```tsx
export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center">
      <p className="text-neon">Gami World Cup '26 — scaffolding works.</p>
    </main>
  );
}
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` and `package-lock.json` created.

- [ ] **Step 10: Verify the build compiles**

Run: `npm run build`
Expected: "Compiled successfully"; route `/` listed in the build output.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts app/
git commit -m "chore: scaffold Next.js 14 + Tailwind (Stadium Night theme)"
```

---

## Task 2: Countdown logic (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/countdown.ts`
- Test: `lib/countdown.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test in `lib/countdown.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { getCountdown, KICKOFF } from "./countdown";

describe("getCountdown", () => {
  it("breaks a future gap into d/h/m/s", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    const now = new Date("2026-06-01T19:37:55Z"); // 9d 4h 22m 5s before
    expect(getCountdown(now, target)).toEqual({
      days: 9,
      hours: 4,
      minutes: 22,
      seconds: 5,
      isLive: false,
    });
  });

  it("reports isLive exactly at the target", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    expect(getCountdown(target, target)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isLive: true,
    });
  });

  it("reports isLive after the target", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    const now = new Date("2026-07-01T00:00:00Z");
    expect(getCountdown(now, target).isLive).toBe(true);
  });

  it("handles the final second before kickoff", () => {
    const target = new Date("2026-06-11T00:00:00Z");
    const now = new Date("2026-06-10T23:59:59Z");
    expect(getCountdown(now, target)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
      isLive: false,
    });
  });

  it("exposes the kickoff constant as 11 June 2026 UTC", () => {
    expect(KICKOFF.toISOString()).toBe("2026-06-11T00:00:00.000Z");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./countdown` (module not yet created).

- [ ] **Step 4: Implement `lib/countdown.ts`**

```ts
export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLive: boolean;
}

/** Tournament kickoff — matches the canonical pool design (2026-05-28 spec). */
export const KICKOFF = new Date("2026-06-11T00:00:00Z");

export function getCountdown(now: Date, target: Date): Countdown {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isLive: true };
  }
  const total = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    isLive: false,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts lib/countdown.ts lib/countdown.test.ts package.json
git commit -m "feat: add tested countdown logic"
```

---

## Task 3: Content data module

**Files:**
- Create: `lib/content.ts`

- [ ] **Step 1: Create `lib/content.ts` with typed content arrays**

```ts
export interface Step {
  n: number;
  title: string;
  body: string;
}

export interface ScoringRow {
  label: string;
  value: string;
}

export interface TimelineItem {
  label: string;
  when: string;
}

export const HOST_NATIONS = "🇺🇸 🇨🇦 🇲🇽 · USA · Canada · Mexico";

export const STEPS: Step[] = [
  {
    n: 1,
    title: "Snake draft",
    body: "Everyone picks 3 teams in snake order. Each nation goes to one manager.",
  },
  {
    n: 2,
    title: "Bonus predictions",
    body: "Call the Golden Boot, Golden Ball & more before kickoff — 2 picks each.",
  },
  {
    n: 3,
    title: "Wildcard",
    body: "After the groups, swap one bonus pick — one-time use.",
  },
  {
    n: 4,
    title: "Knockout re-shuffle",
    body: "Blind-swap teams before the knockouts — keep your runners, ditch the dead weight.",
  },
];

export const SCORING_ROWS: ScoringRow[] = [
  { label: "Qualify from group", value: "+5" },
  { label: "Reach R16 / QF / SF", value: "4 / 8 / 14" },
  { label: "Final · Champion", value: "22 / 34" },
  { label: "Each correct bonus pick", value: "+8" },
];

export const TIMELINE: TimelineItem[] = [
  { label: "Register & draft", when: "now" },
  { label: "Group stage", when: "11–27 Jun" },
  { label: "Wildcard + knockout swap", when: "late Jun" },
  { label: "Knockouts → Final", when: "19 Jul" },
];
```

- [ ] **Step 2: Verify it type-checks via build later**

No standalone test (pure data). Correctness is enforced by TypeScript when components import it in later tasks.

- [ ] **Step 3: Commit**

```bash
git add lib/content.ts
git commit -m "feat: add landing page content data"
```

---

## Task 4: Countdown component (client)

**Files:**
- Create: `components/Countdown.tsx`

- [ ] **Step 1: Implement `components/Countdown.tsx`**

Renders four chips. Starts as `null` until mounted to avoid a server/client hydration mismatch (the server has no live clock).

```tsx
"use client";

import { useEffect, useState } from "react";
import { getCountdown, KICKOFF, type Countdown } from "@/lib/countdown";

const UNITS: { key: keyof Omit<Countdown, "isLive">; label: string }[] = [
  { key: "days", label: "DAYS" },
  { key: "hours", label: "HRS" },
  { key: "minutes", label: "MIN" },
  { key: "seconds", label: "SEC" },
];

export default function Countdown() {
  const [c, setC] = useState<Countdown | null>(null);

  useEffect(() => {
    const tick = () => setC(getCountdown(new Date(), KICKOFF));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (c?.isLive) {
    return <p className="mt-4 text-neon font-extrabold tracking-wide">KICK-OFF! ⚽</p>;
  }

  return (
    <div>
      <div className="flex justify-center gap-2">
        {UNITS.map(({ key, label }) => (
          <div
            key={key}
            className="rounded-xl border border-neon/20 bg-panel px-3 py-2 min-w-[3.5rem]"
          >
            <div className="text-2xl font-extrabold text-neon tabular-nums">
              {c ? String(c[key]).padStart(2, "0") : "--"}
            </div>
            <div className="text-[7px] tracking-widest text-bodytext/60">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[9px] text-caption">until kickoff · 11 June 2026</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Countdown.tsx
git commit -m "feat: add live countdown component"
```

---

## Task 5: Hero section

**Files:**
- Create: `components/Hero.tsx`

- [ ] **Step 1: Implement `components/Hero.tsx`**

```tsx
import Countdown from "./Countdown";
import { HOST_NATIONS } from "@/lib/content";

export default function Hero() {
  return (
    <section
      className="px-6 pt-12 pb-9 text-center"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #1c2a5e 0%, #0a0e27 65%)",
      }}
    >
      <div className="text-[10px] font-bold tracking-[0.2em] text-neon">
        FIFA WORLD CUP 2026 · THE FRIENDS POOL
      </div>
      <h1 className="my-3 text-4xl font-black uppercase leading-[0.98]">
        Gami
        <br />
        World Cup
        <br />
        <span className="text-neon">&apos;26</span>
      </h1>
      <p className="text-xs text-bodytext">8 mates · snake-draft 48 nations</p>
      <p className="mb-1 text-xs font-semibold">winner lifts the Golden Drumstick 🍗</p>
      <p className="mb-5 text-[11px] text-caption">{HOST_NATIONS}</p>
      <Countdown />
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Hero.tsx
git commit -m "feat: add hero section"
```

---

## Task 6: How It Works section

**Files:**
- Create: `components/HowItWorks.tsx`

- [ ] **Step 1: Implement `components/HowItWorks.tsx`**

```tsx
import { STEPS } from "@/lib/content";

export default function HowItWorks() {
  return (
    <section className="border-t border-glow px-6 py-6">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.15em] text-neon">
        HOW IT WORKS
      </h2>
      <ol className="space-y-3">
        {STEPS.map((step) => (
          <li key={step.n} className="flex gap-3">
            <span className="text-sm font-black text-neon">{step.n}</span>
            <div>
              <div className="text-[13px] font-bold">{step.title}</div>
              <div className="text-[11px] text-bodytext">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/HowItWorks.tsx
git commit -m "feat: add how-it-works section"
```

---

## Task 7: Scoring section

**Files:**
- Create: `components/Scoring.tsx`

- [ ] **Step 1: Implement `components/Scoring.tsx`**

```tsx
import { SCORING_ROWS } from "@/lib/content";

export default function Scoring() {
  return (
    <section className="border-t border-glow px-6 py-6">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.15em] text-neon">
        SCORING
      </h2>
      <div className="rounded-xl bg-panel px-4 py-3">
        {SCORING_ROWS.map((row, i) => (
          <div
            key={row.label}
            className={`flex justify-between py-1.5 text-xs ${
              i < SCORING_ROWS.length - 1 ? "border-b border-glow" : ""
            }`}
          >
            <span className="text-bodytext">{row.label}</span>
            <span className="font-extrabold text-neon">{row.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-caption">
        Draft values — tunable before kickoff. Points are split between group &amp;
        knockout owners.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Scoring.tsx
git commit -m "feat: add scoring section"
```

---

## Task 8: Timeline section

**Files:**
- Create: `components/Timeline.tsx`

- [ ] **Step 1: Implement `components/Timeline.tsx`**

```tsx
import { TIMELINE } from "@/lib/content";

export default function Timeline() {
  return (
    <section className="border-t border-glow px-6 py-6">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.15em] text-neon">
        THE ROAD AHEAD
      </h2>
      <ul className="space-y-2 text-[11px] text-bodytext">
        {TIMELINE.map((item) => (
          <li key={item.label}>
            <span className="text-neon">●</span> {item.label}{" "}
            <span className="text-caption">— {item.when}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Timeline.tsx
git commit -m "feat: add timeline section"
```

---

## Task 9: Footer section

**Files:**
- Create: `components/SiteFooter.tsx`

- [ ] **Step 1: Implement `components/SiteFooter.tsx`**

Plain feedback nudge (no form, no real link yet — see spec open question).

```tsx
export default function SiteFooter() {
  return (
    <footer className="border-t border-glow bg-footer px-6 py-7 text-center">
      <div className="mb-1.5 text-sm font-extrabold">Want in? 👀</div>
      <p className="mb-4 text-[11px] text-bodytext">
        Shout in the group chat. Tear the rules apart — nothing&apos;s locked yet.
      </p>
      <div className="rounded-lg bg-neon px-4 py-3 text-xs font-extrabold text-navy">
        Drop your feedback 💬
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SiteFooter.tsx
git commit -m "feat: add footer feedback section"
```

---

## Task 10: Compose the page & verify

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx` with the composed page**

```tsx
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Scoring from "@/components/Scoring";
import Timeline from "@/components/Timeline";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-md bg-navy">
      <Hero />
      <HowItWorks />
      <Scoring />
      <Timeline />
      <SiteFooter />
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — countdown tests green.

- [ ] **Step 3: Verify the production build compiles**

Run: `npm run build`
Expected: "Compiled successfully"; `/` rendered as static content.

- [ ] **Step 4: Visual check on mobile width**

Run: `npm run dev`, open `http://localhost:3000`, set the browser to a phone viewport (~390px).
Expected: hero with name + host nations + ticking countdown; four how-it-works steps; scoring panel; timeline; footer. No horizontal scroll; neon-on-navy theme renders.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: compose landing page from sections"
```

---

## Task 11: Deploy to Vercel

**Files:** none (deployment config).

- [ ] **Step 1: Push the branch**

Run: `git push origin main`
Expected: commits land on `github.com/ryban3z/gami-world-cup-2026`.

- [ ] **Step 2: Link & deploy via Vercel**

Run: `npx vercel` (login if prompted), accept defaults (framework auto-detected as Next.js), then `npx vercel --prod` for a production URL.
Expected: a public `*.vercel.app` URL serving the page.

Alternative (no CLI): import the GitHub repo at vercel.com → New Project → deploy. Every push to `main` then auto-deploys.

- [ ] **Step 3: Verify the live URL on a phone**

Open the `*.vercel.app` URL on a real phone.
Expected: page loads fast, countdown ticks, layout correct, no login required.

- [ ] **Step 4: Update CLAUDE.md with real commands**

Per the repo's CLAUDE.md note ("if you scaffold the app, add the real commands here"), replace the "no build/lint/test commands" line with: `npm run dev`, `npm run build`, `npm run lint`, `npm test`, and the deploy step.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record build/test/deploy commands in CLAUDE.md"
git push origin main
```

---

## Notes for the implementer

- **No worktree was created** for this small greenfield page; work directly on `main`.
- **Hydration:** the countdown must start as `null`/`--` and populate on mount — do not compute live time during server render.
- **Theme tokens** (`navy`, `panel`, `glow`, `neon`, `bodytext`, `caption`, `footer`) are defined once in `tailwind.config.ts`; use them, don't hardcode hexes in components (the hero gradient is the one allowed inline exception).
- **Mobile-first** is a hard requirement (see canonical spec) — the page is capped at `max-w-md` and designed phone-up.
