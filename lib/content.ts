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
    body: "Drop a team that's out and grab a free agent still alive in the Round of 32 — one swap before the knockouts.",
  },
  {
    n: 5,
    title: "Surprise bonus games",
    body: "Quick, time-limited side-bets pop up during the tournament — call the random and the ridiculous for extra points.",
  },
];

export const SCORING_ROWS: ScoringRow[] = [
  { label: "Qualify from group", value: "+5" },
  { label: "Then reach R16 / QF / SF", value: "+6 / +10 / +14" },
  { label: "Final · Champion", value: "+18 / +24" },
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
  wooden_spoon: "Your pick for the worst / most disappointing team of the tournament.",
};
