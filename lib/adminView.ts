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
