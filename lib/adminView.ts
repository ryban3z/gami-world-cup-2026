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
  key: string; // phase name or knockout-round key (r32 … final)
  label: string;
  status: PhaseStatus;
}

// Knockout rounds, in play order. The single game_config `knockout_locked` phase
// is expanded into these five steps in the banner (third-place play-off omitted —
// it's a side fixture, not a bracket round).
export type KnockoutRound = "r32" | "r16" | "qf" | "sf" | "final";
const KNOCKOUT_ROUNDS: KnockoutRound[] = ["r32", "r16", "qf", "sf", "final"];

// The full ordered banner sequence: the macro phases with `knockout_locked`
// expanded into its rounds. Position (array index) drives done/current/upcoming.
const STEP_SEQUENCE: { key: string; label: string }[] = [
  { key: "registration", label: "Registration" },
  { key: "draft", label: "Draft" },
  { key: "group_locked", label: "Group stage" },
  { key: "knockout_realloc", label: "Knockout swap" },
  { key: "r32", label: "RO32" },
  { key: "r16", label: "RO16" },
  { key: "qf", label: "QF" },
  { key: "sf", label: "SF" },
  { key: "final", label: "Final" },
  { key: "complete", label: "Complete" },
];

// Which knockout round is live, from the fixtures: the shallowest round that has
// fixtures but isn't fully played (the round in progress / next up). If every
// round with fixtures is final, the deepest one (tournament winding down). Null
// when no knockout fixtures exist yet. Drives the highlighted round in the banner.
export function currentKnockoutRound(
  matches: { stage: string; status: string }[],
): KnockoutRound | null {
  let deepestComplete: KnockoutRound | null = null;
  for (const round of KNOCKOUT_ROUNDS) {
    const inRound = matches.filter((m) => m.stage === round);
    if (inRound.length === 0) continue;
    if (inRound.some((m) => m.status !== "final")) return round;
    deepestComplete = round;
  }
  return deepestComplete;
}

// Ordered, labelled banner steps with done/current/upcoming status. During
// `knockout_locked` the live round is highlighted (defaults to RO32 before any
// knockout fixture exists); every other phase highlights its own step.
export function phaseSteps(
  current: GamePhase,
  knockoutRound: KnockoutRound | null = null,
): PhaseStep[] {
  const currentKey =
    current === "knockout_locked" ? knockoutRound ?? "r32" : current;
  const currentPos = STEP_SEQUENCE.findIndex((s) => s.key === currentKey);
  return STEP_SEQUENCE.map((s, i) => ({
    key: s.key,
    label: s.label,
    status: i < currentPos ? "done" : i === currentPos ? "current" : "upcoming",
  }));
}

// Manual "Refresh results" is rate-limited server-side: football-data.org's free
// tier allows 10 req/min and the daily cron covers normal updates, so we only
// guard against impatient re-clicks. Returns how long (ms) until another refresh
// is allowed — 0 means good to go.
export const REFRESH_COOLDOWN_MS = 30_000;

export function refreshCooldownRemainingMs(
  lastSyncIso: string | null,
  now: number = Date.now(),
): number {
  if (!lastSyncIso) return 0;
  const last = new Date(lastSyncIso).getTime();
  if (Number.isNaN(last)) return 0;
  return Math.max(0, REFRESH_COOLDOWN_MS - (now - last));
}
