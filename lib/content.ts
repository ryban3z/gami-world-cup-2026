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

export interface FaqEntry {
  q: string;
  a: string;
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
    body: "Between the group and knockout stages, change a single bonus pick — a one-time swap you can edit until the window closes.",
  },
  {
    n: 4,
    title: "Knockout re-shuffle",
    body: "Drop a team that's out and grab a free agent still alive in the Round of 32 — one swap before the knockouts.",
  },
  {
    n: 5,
    title: "Surprise bonus games",
    body: "Quick, time-limited side-bets pop up during the tournament — call the random and the ridiculous for extra points.",
  },
];

export const SCORING_ROWS: ScoringRow[] = [
  { label: "Each group-stage win", value: "+1" },
  { label: "Qualify from group", value: "+4" },
  { label: "Furthest stage: R16 / QF / SF", value: "+6 / +10 / +14" },
  { label: "Reach the final", value: "+18" },
  { label: "Champion (+6 on the final)", value: "+24" },
  { label: "Each correct bonus pick", value: "+4" },
];

export const TIMELINE: TimelineItem[] = [
  { label: "Draft & rosters", when: "done ✓" },
  { label: "Picks lock", when: "10 Jun · eve of kickoff" },
  { label: "Group stage", when: "11–27 Jun" },
  { label: "Knockout swap + wildcard", when: "after groups · ~28 Jun" },
  { label: "Round of 32", when: "28 Jun – 3 Jul" },
  { label: "R16 → quarters", when: "4–11 Jul" },
  { label: "Semis & final", when: "14–19 Jul" },
];

// One-line "who/why" blurb per bonus award, keyed by bonus_categories.key.
// Rendered under each award on the predictions page (form + reveal). Edit copy
// here — names themselves live in the DB (bonus_categories.name).
export const BONUS_AWARD_INFO: Record<string, string> = {
  golden_boot: "Top goalscorer of the tournament (assists break ties).",
  golden_ball: "Best overall player of the tournament, decided by a media vote.",
  golden_glove: "Best goalkeeper of the tournament.",
  young_player: "Best player aged 21 or under (born on or after 1 Jan 2005).",
  most_assists: "Most assists across the tournament — a Gami-pool extra, not an official FIFA award.",
  tournament_winner: "The team that lifts the trophy.",
  runner_up: "The team that loses the final.",
  wooden_spoon: "The worst team — fewest group-stage points, then worst goal difference; managers vote to break any remaining tie.",
};

// FAQ shown on the logged-in /faq page (linked from the bottom of /home).
// Keep answers short and plain — this is the single source of truth players
// reach for when they're unsure how a rule works. Scoring numbers here must
// match SCORING_ROWS above and the seeded scoring_config.
export const FAQ_ENTRIES: FaqEntry[] = [
  {
    q: "How do I score points during the group stage?",
    a: "Each of your teams earns +1 for every group-stage win, and +4 the moment it clinches a top-2 finish and qualifies for the Round of 32. The qualify reward lands as soon as a spot is mathematically guaranteed — you don't have to wait for the final group game.",
  },
  {
    q: "How do knockout points work?",
    a: "A team scores for the furthest stage it reaches — the values are totals, not added together: +6 for the Round of 16, +10 for the quarter-finals, +14 for the semis, and +18 for reaching the final. Winning the final adds a +6 champion bonus, so the trophy is worth +24 in total. All of this stacks on the +4 qualify reward, so a team knocked out in the Round of 16 is worth 10 overall, and a champion is worth 28.",
  },
  {
    q: "How do bonus predictions score?",
    a: "Every correct bonus pick (Golden Boot, Golden Ball, tournament winner, and the rest) is worth +4. You lock your picks before kickoff, and only the correct ones score — there's no penalty for a miss.",
  },
  {
    q: "Can I change my bonus picks after I submit them?",
    a: "Your picks are freely editable right up until they lock the evening before the first match. After that they're frozen for the whole group stage — the only change allowed is the one-time wildcard.",
  },
  {
    q: "What is the wildcard?",
    a: "The wildcard is a single, one-time change to one of your bonus picks. It's offered in the knockout window between the group and knockout stages, after you've seen how the groups played out. While the window is open the change is pending and editable — you can adjust or clear it — and it's applied for good when the admin resolves the window. It replaces just that one pick; the rest stay as they were.",
  },
  {
    q: "How does the knockout team swap work?",
    a: "Between the group and knockout stages you may make one optional swap: drop a team and pick up an undrafted team that reaches the Round of 32. You submit the team you'll drop plus a ranked top-3 wishlist of undrafted teams. When the admin resolves the window, managers are served worst-placed-first on the leaderboard, and each gets their highest still-available wishlist team that actually made the Round of 32. Leave the wishlist empty to keep your roster unchanged.",
  },
  {
    q: "If I swap a team, who keeps its points?",
    a: "Group-stage points (wins + qualifying) always stay with whoever drafted the team. Knockout-stage points go to whoever owns the team for the knockouts. So if you pick up a team after the groups, you earn its knockout run; its earlier group points stay with the original drafter.",
  },
  {
    q: "When does everything happen?",
    a: "Bonus picks lock the eve of kickoff. The group stage runs through late June, then the knockout swap + wildcard window opens before the Round of 32. After that it's Round of 32 → Round of 16 → quarters → semis → final, with the knockout ladder paying out as teams advance.",
  },
];
