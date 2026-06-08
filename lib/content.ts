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
  { label: "Reach R16 / QF / SF", value: "6 / 10 / 14" },
  { label: "Final · Champion", value: "18 / 24" },
  { label: "Each correct bonus pick", value: "+4" },
];

export const TIMELINE: TimelineItem[] = [
  { label: "Registration", when: "open now" },
  { label: "Draft opens", when: "tentative · Fri 5 Jun" },
  { label: "Picks lock", when: "10 Jun · eve of kickoff" },
  { label: "Group stage", when: "11–27 Jun" },
  { label: "Wildcard + knockout swap", when: "late Jun" },
  { label: "Knockouts → Final", when: "19 Jul" },
];
