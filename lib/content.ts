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
