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
