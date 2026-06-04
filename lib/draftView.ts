// Pure view-layer helpers that turn draft_state() numbers into display-ready
// shapes. No IO. Snake math is reused from ./draft (SQL-mirrored) — never
// re-derived here.
import { playerIndexForPick } from "./draft";

/** English ordinal for a positive integer: 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export interface TurnContext {
  pickNumber: number; // 1-based number of the pick about to be made
  picksTotal: number;
  round: number; // 1-based snake round
  teamOrdinal: string; // which team this round is for the picker, e.g. "2nd"
}

/**
 * Context for the turn banner. In a snake draft each player picks once per
 * round, so the round number equals which team the current picker is choosing.
 */
export function turnContext(picksMade: number, picksTotal: number, playerCount: number): TurnContext {
  const round = Math.floor(picksMade / playerCount) + 1;
  return { pickNumber: picksMade + 1, picksTotal, round, teamOrdinal: ordinal(round) };
}

export type RailStatus = "done" | "now" | "next" | "upcoming";

export interface RailEntry {
  name: string;
  status: RailStatus;
}

export interface DraftRail {
  round: number; // 1-based
  entries: RailEntry[]; // in visual snake order for the current round
}

/**
 * The current round's pick order as display-ready pills. Entries are in visual
 * snake order (forward on even rounds, reversed on odd) so players watch the
 * order turn around at the ends. When the last picker of a round is on the
 * clock, no entry is 'next' — the snake turns around to that same player, which
 * a single rail can't meaningfully mark.
 */
export function snakeRailForRound(orderNames: string[], picksMade: number, playerCount: number): DraftRail {
  const round0 = Math.floor(picksMade / playerCount); // 0-based round
  const positionInRound = picksMade % playerCount; // 0-based seat of current picker
  const entries: RailEntry[] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    const playerIdx = playerIndexForPick(round0 * playerCount + seat, playerCount);
    let status: RailStatus;
    if (seat < positionInRound) status = "done";
    else if (seat === positionInRound) status = "now";
    else if (seat === positionInRound + 1 && positionInRound + 1 < playerCount) status = "next";
    else status = "upcoming";
    entries.push({ name: orderNames[playerIdx], status });
  }
  return { round: round0 + 1, entries };
}

// Structural subset of board entries this helper needs — decouples lib/ from
// the BoardTeam type declared in components/.
interface BoardTeamLite {
  id: string;
  name: string;
  flag_url: string | null;
}

export interface PickSlot {
  name: string;
  flag_url: string | null;
}

/**
 * The caller's roster as a fixed-length array of `slotCount` slots: each owned
 * team (in pick order) mapped to its board entry, remaining slots `null`.
 */
export function myPickSlots(myTeamIds: string[], board: BoardTeamLite[], slotCount: number): (PickSlot | null)[] {
  const byId = new Map(board.map((t) => [t.id, t]));
  const slots: (PickSlot | null)[] = [];
  for (let i = 0; i < slotCount; i++) {
    const id = myTeamIds[i];
    const team = id ? byId.get(id) : undefined;
    slots.push(team ? { name: team.name, flag_url: team.flag_url } : null);
  }
  return slots;
}
