// football-data.org WC client + pure mapper. The mapper is unit-tested; the
// fetch is thin IO used by lib/pipeline.ts (server-only).

import { buildTopScorers, type TopScorerRow } from "@/lib/topScorersView";

export type MatchStage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";
export type MatchStatus = "scheduled" | "live" | "final";
export type ApiWinner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;

const STAGE_MAP: Record<string, MatchStage> = {
  GROUP_STAGE: "group", LAST_32: "r32", LAST_16: "r16",
  QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third_place", FINAL: "final",
};
// Full football-data v4 status enum. EXTRA_TIME / PENALTY_SHOOTOUT are live
// states (a level knockout match must not regress to "scheduled" mid-game) and
// AWARDED is a finished result. SUSPENDED / POSTPONED / CANCELLED fall through
// to the "scheduled" default below — no result to score yet.
const STATUS_MAP: Record<string, MatchStatus> = {
  SCHEDULED: "scheduled", TIMED: "scheduled",
  IN_PLAY: "live", PAUSED: "live", LIVE: "live",
  EXTRA_TIME: "live", PENALTY_SHOOTOUT: "live",
  FINISHED: "final", AWARDED: "final",
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
  // Penalty-shootout result, separate from the on-pitch score. Null when the
  // match wasn't decided on penalties.
  homePenalties: number | null;
  awayPenalties: number | null;
  winner: ApiWinner;
}

type ApiScore = { home: number | null; away: number | null };

// Minimal shape of a football-data match we depend on. `penalties` is populated
// only for shootout knockouts; `fullTime` folds the shootout into the score
// there (a 1–1 decided 4–3 on pens comes through as fullTime 5–4), so the mapper
// peels the penalties back out — see mapApiMatch.
interface ApiMatch {
  id: number;
  utcDate: string | null;
  stage: string;
  group: string | null;
  status: string;
  homeTeam: { id: number | null };
  awayTeam: { id: number | null };
  score: {
    winner: string | null;
    fullTime: ApiScore;
    penalties?: ApiScore | null;
  };
}

const ext = (id: number | null): string | null => (id == null ? null : String(id));

// Returns null for a stage we don't recognise (football-data has never run a
// 48-team World Cup, so LAST_32 is an assumption) — the caller skips and
// reports it instead of one odd fixture aborting the whole ingest.
export function mapApiMatch(m: ApiMatch): MappedMatch | null {
  const stage = STAGE_MAP[m.stage];
  if (!stage) return null;
  let homeScore = m.score?.fullTime?.home ?? null;
  let awayScore = m.score?.fullTime?.away ?? null;
  // A penalty shootout is reported in `score.penalties`, but football-data also
  // folds it into `fullTime` (1–1 decided 4–3 on pens arrives as fullTime 5–4).
  // Peel the shootout back out so `homeScore`/`awayScore` carry the on-pitch
  // result and the pens are reported on their own. Clamp at 0 so an unexpected
  // feed (fullTime already net of pens) never yields a negative score.
  const pens = m.score?.penalties;
  const homePenalties = pens?.home ?? null;
  const awayPenalties = pens?.away ?? null;
  if (homePenalties != null && awayPenalties != null && homeScore != null && awayScore != null) {
    homeScore = Math.max(0, homeScore - homePenalties);
    awayScore = Math.max(0, awayScore - awayPenalties);
  }
  let status = STATUS_MAP[m.status] ?? "scheduled";
  // football-data can flip a match to FINISHED minutes before the result is
  // entered (free-tier data lag). A score-less "final" would surface as a
  // null–null result and can't be scored — hold it at "live" until the
  // numbers arrive; the next ingest finalises it.
  if (status === "final" && homeScore == null && awayScore == null) status = "live";
  return {
    externalId: String(m.id),
    stage,
    groupLetter: m.group ? m.group.replace(/^GROUP_/, "") : null,
    homeExternalId: ext(m.homeTeam?.id ?? null),
    awayExternalId: ext(m.awayTeam?.id ?? null),
    kickoffAt: m.utcDate ?? null,
    status,
    homeScore,
    awayScore,
    homePenalties,
    awayPenalties,
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

// --- Top scorers -----------------------------------------------------------
// The /scorers resource is keyed by player, not by our team/match external_id
// seam, so it's read-only colour for the dashboard — not a scoring input. The
// free tier populates `goals` reliably but often leaves `assists`/`penalties`
// null, hence the nullable fields below.

export interface MappedScorer {
  playerName: string;
  // football-data's team id — maps to teams.external_id so the view can reuse
  // our own flag_url instead of the API crest.
  teamExternalId: string | null;
  teamName: string | null;
  goals: number;
  assists: number | null;
  penalties: number | null;
  playedMatches: number | null;
}

interface ApiScorer {
  player: { name: string | null } | null;
  team: { id: number | null; name: string | null } | null;
  goals: number | null;
  assists: number | null;
  penalties: number | null;
  playedMatches: number | null;
}

// Drops entries with no player name or no goal count — they can't anchor a
// scorers table — so one malformed row never breaks the whole list.
export function mapApiScorer(s: ApiScorer): MappedScorer | null {
  const playerName = s.player?.name?.trim();
  if (!playerName || s.goals == null) return null;
  return {
    playerName,
    teamExternalId: ext(s.team?.id ?? null),
    teamName: s.team?.name ?? null,
    goals: s.goals,
    assists: s.assists ?? null,
    penalties: s.penalties ?? null,
    playedMatches: s.playedMatches ?? null,
  };
}

// Cached (revalidate) rather than no-store: the live dashboard renders
// dynamically and the free tier rate-limits to ~10 calls/min, so a per-viewer
// fetch would burn the quota. A scorers board barely moves within a day, let
// alone an hour — 1 hour keeps it fresh enough while sipping the quota.
const SCORERS_REVALIDATE_SECONDS = 3600;

export async function fetchWcScorers(token: string, limit = 10): Promise<MappedScorer[]> {
  const res = await fetch(`https://api.football-data.org/v4/competitions/WC/scorers?limit=${limit}`, {
    headers: { "X-Auth-Token": token },
    next: { revalidate: SCORERS_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`football-data scorers fetch failed: ${res.status}`);
  const data = await res.json();
  return ((data.scorers ?? []) as ApiScorer[])
    .map(mapApiScorer)
    .filter((s): s is MappedScorer => s !== null);
}

// Server helper for the Golden Boot board, shared by /home, /leaderboard and
// /predictions/status. Reads FOOTBALL_DATA_TOKEN and guards the fetch so a
// missing token or an API hiccup degrades to an empty list (never a broken
// page). `limit` is the display count; the feed itself is cached 1 hour.
export async function loadTopScorers(
  teams: { external_id: string | null; flag_url: string | null }[],
  limit = 10,
): Promise<TopScorerRow[]> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return [];
  try {
    return buildTopScorers(await fetchWcScorers(token), teams, limit);
  } catch {
    return [];
  }
}
