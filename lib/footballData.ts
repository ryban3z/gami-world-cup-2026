// football-data.org WC client + pure mapper. The mapper is unit-tested; the
// fetch is thin IO used by lib/pipeline.ts (server-only).

export type MatchStage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";
export type MatchStatus = "scheduled" | "live" | "final";
export type ApiWinner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;

const STAGE_MAP: Record<string, MatchStage> = {
  GROUP_STAGE: "group", LAST_32: "r32", LAST_16: "r16",
  QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third_place", FINAL: "final",
};
const STATUS_MAP: Record<string, MatchStatus> = {
  SCHEDULED: "scheduled", TIMED: "scheduled",
  IN_PLAY: "live", PAUSED: "live",
  FINISHED: "final",
};

export interface MappedMatch {
  externalId: string;
  stage: MatchStage;
  groupLetter: string | null;
  homeExternalId: string | null;
  awayExternalId: string | null;
  kickoffAt: string | null;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  winner: ApiWinner;
}

// Minimal shape of a football-data match we depend on.
interface ApiMatch {
  id: number;
  utcDate: string | null;
  stage: string;
  group: string | null;
  status: string;
  homeTeam: { id: number | null };
  awayTeam: { id: number | null };
  score: { winner: string | null; fullTime: { home: number | null; away: number | null } };
}

const ext = (id: number | null): string | null => (id == null ? null : String(id));

export function mapApiMatch(m: ApiMatch): MappedMatch {
  const stage = STAGE_MAP[m.stage];
  if (!stage) throw new Error(`unknown stage: ${m.stage}`);
  return {
    externalId: String(m.id),
    stage,
    groupLetter: m.group ? m.group.replace(/^GROUP_/, "") : null,
    homeExternalId: ext(m.homeTeam?.id ?? null),
    awayExternalId: ext(m.awayTeam?.id ?? null),
    kickoffAt: m.utcDate ?? null,
    status: STATUS_MAP[m.status] ?? "scheduled",
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    winner: (m.score?.winner ?? null) as ApiWinner,
  };
}

export async function fetchWcMatches(token: string): Promise<ApiMatch[]> {
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`football-data matches fetch failed: ${res.status}`);
  const data = await res.json();
  return data.matches as ApiMatch[];
}
