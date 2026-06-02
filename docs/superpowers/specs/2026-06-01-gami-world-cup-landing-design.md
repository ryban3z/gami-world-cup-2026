# Gami World Cup '26 — Landing Page Design Spec

**Date:** 2026-06-01
**Status:** Approved (ready for implementation plan)

---

## Overview

A single, public, mobile-first landing page for the **Gami World Cup '26** betting pool — a private World Cup 2026 pool for ~8 friends (the "Gami All-Stars", named after a beloved fried-chicken joint). The page is an **info hub**: it explains the concept, lays out the full rules and scoring, and counts down to kickoff (11 June 2026). Its purpose is to let the lads read the rules and react in the group chat **before anything is locked in**.

This is the first shippable piece of the real app. It is built on the planned production stack (Next.js 14 on Vercel) so it becomes the app's eventual front door rather than throwaway work.

---

## Goals

- Give mates a single shareable URL that explains the pool at a glance on a phone.
- Present the full rules and scoring clearly enough to gather meaningful feedback.
- Build excitement with branding and a live countdown.
- Stand up the real Next.js + Vercel project as a foundation for later phases.

## Non-Goals (out of scope for this page)

- **No signup / data capture.** No "I'm in" form, no email collection. Feedback happens in the group chat. (A footer nudge points there.)
- **No authentication / password gate.** The page is fully public so mates can open it without an account. The shared-password gate comes later, with real registration.
- **No backend / database.** The page is static content. Supabase is not involved yet.
- **No live data.** The countdown is the only dynamic element (computed client-side from a fixed kickoff date).

---

## Content & Sections

A single scrolling page, top to bottom:

1. **Hero**
   - Eyebrow: `FIFA WORLD CUP 2026 · THE FRIENDS POOL`
   - Title: **GAMI WORLD CUP '26** (`'26` in accent colour)
   - Tagline: `8 mates · snake-draft 48 nations` / `winner lifts the Golden Drumstick 🍗`
   - Host-nations flavour line: `🇺🇸 🇨🇦 🇲🇽 · USA · Canada · Mexico`
   - **Live countdown** to kickoff: 11 June 2026, 00:00 (days / hrs / min / sec), with `until kickoff · 11 June 2026` caption.

2. **How it works** (numbered, four steps)
   1. **Snake draft** — everyone picks 3 teams in snake order; each nation goes to one manager.
   2. **Bonus predictions** — call the Golden Boot, Golden Ball & more before kickoff; 2 picks each.
   3. **Wildcard** — after the groups, swap one bonus pick (one-time use).
   4. **Knockout re-shuffle** — blind-swap teams before the knockouts.

3. **Scoring** (table; labelled as draft values, tunable before kickoff)
   - Qualify from group: **+5**
   - Reach R16 / QF / SF: **4 / 8 / 14**
   - Final / Champion: **22 / 34**
   - Each correct bonus pick: **+8**
   - Caption: points are split between group-stage and knockout owners.

4. **The road ahead** (timeline)
   - Register & draft — now
   - Group stage — 11–27 Jun
   - Wildcard + knockout swap — late Jun
   - Knockouts → Final — 19 Jul

5. **Footer CTA**
   - "Want in? Shout in the group chat. Tear the rules apart — nothing's locked yet."
   - A feedback nudge (text/link to the group chat). No form.

All figures trace to the canonical pool design (`2026-05-28-world-cup-pool-design.md`); if scoring values change there, this page follows.

---

## Visual Design — "Stadium Night"

- **Mood:** dark, electric, modern-sporty — like a broadcast graphic under floodlights.
- **Palette:** deep navy background (`#0a0e27`), raised panels (`#11183a`), radial top-glow (`#1c2a5e`), gold accent (`#ffd24a`), muted blue-grey body text (`#9fb0d8`), dim captions (`#6b7aa3`).
- **Type:** system sans (`Segoe UI`/system-ui); heavy uppercase weights for the hero, clear hierarchy with small letter-spaced eyebrow labels.
- **Components:** countdown shown as bordered chips; scoring inside a raised rounded panel; section dividers as 1px navy rules; pill-style footer button.
- **Mobile-first:** designed phone-width (~340px content column) and scales up; this is the primary form factor.

---

## Technical Approach

- **Framework:** Next.js 14 (App Router) + TypeScript — the project's planned stack, scaffolded fresh in this repo.
- **Styling:** Tailwind CSS (default with Next.js) for the Stadium Night theme.
- **Page:** a single route (`app/page.tsx`) composed of small, focused section components (Hero, HowItWorks, Scoring, Timeline, Footer). The countdown is a small client component; everything else is static/server-rendered.
- **Content as data:** scoring rows, steps, and timeline items defined as typed arrays so they're trivial to tweak and later swap for live values.
- **Hosting:** **Vercel** (runs the Next.js app). **Supabase is intentionally not used yet** — there is no data or auth on this page. They join later: Next.js on Vercel ⇄ Supabase for data + auth.
- **Deployment:** public Vercel deployment, shareable URL. Repo will need `git init` + a Vercel project link.

---

## Acceptance

- Loads fast and looks correct on a phone (primary), tablet, and desktop.
- Countdown is accurate and ticks down to 11 June 2026.
- All five sections present with content matching the canonical design.
- Publicly reachable at a Vercel URL with no login.

---

## Open Questions

- [x] ~~Footer feedback nudge~~ — plain "shout in the group chat" text for now; a real WhatsApp invite link can be dropped in later.
- [x] ~~Name the 5 bonus categories vs teaser~~ — keep the "Golden Boot, Golden Ball & more" teaser (full list isn't final in the canonical spec).
- [x] ~~List the host nations~~ — yes, subtle `🇺🇸 🇨🇦 🇲🇽 · USA · Canada · Mexico` flavour line in the hero.
- [ ] Real WhatsApp/group-chat invite link to wire into the footer (whenever available).
