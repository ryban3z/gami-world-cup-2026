// Pure view-layer helpers for the live dashboard. No IO. Shapes already-fetched
// scores / standings / matches into render-ready view models. Structural "lite"
// input types decouple lib/ from component types (same pattern as managerProfileView.ts).

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";

export const STAGE_LABELS: Record<Stage, string> = {
  group: "Group",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  third_place: "Third-place play-off",
  final: "Final",
};

// How deep each stage is — used to order "my teams" by how far they've gone.
const STAGE_DEPTH: Record<Stage, number> = {
  group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third_place: 4, final: 5,
};

interface ScoreLite {
  user_id: string;
  total_points: number;
  breakdown: {
    group: number;
    group_qualify?: number;
    group_win?: number;
    knockout: number;
    bonus: number;
    by_team: { team: string; phase: "group" | "knockout"; points: number }[];
  };
}
interface ProfileLite { id: string; display_name: string; avatar_url?: string | null; }
interface TeamLite { id: string; name: string; flag_url: string | null; }
interface StandingLite {
  team_id: string; furthest_stage: Stage; is_eliminated: boolean; is_champion: boolean;
  qualified: boolean;
}
interface MatchLite {
  id: string; stage: Stage; group_letter: string | null;
  home_team_id: string | null; away_team_id: string | null;
  kickoff_at: string | null; home_score: number | null; away_score: number | null;
  // Penalty-shootout score, null when the match wasn't decided on penalties.
  home_penalties?: number | null; away_penalties?: number | null;
  winner_team_id: string | null; status: "scheduled" | "live" | "final";
}

export interface LeaderTeamPoints {
  name: string; flagUrl: string | null; phase: "group" | "knockout"; points: number;
}
export interface LeaderRow {
  rank: number; userId: string; displayName: string; isSelf: boolean;
  // Manager's profile photo, shown as a small circle next to the name. Photo-only
  // (null when no upload) — same treatment as the match-strip owner avatar.
  avatarUrl: string | null;
  total: number; group: number; groupQualify: number; groupWin: number; knockout: number; bonus: number;
  byTeam: LeaderTeamPoints[];
}
export interface MyTeamStatus {
  name: string; flagUrl: string | null; stageLabel: string;
  isEliminated: boolean; isChampion: boolean; isQualified: boolean;
  // Dropped in the knockout swap — shown struck-through after the live squad.
  isDropped: boolean;
}
// A manager's photo + name, shown next to a team they own in the match strip.
export interface OwnerBadge { avatarUrl: string; name: string; }
export interface MatchStripItem {
  id: string; stageLabel: string;
  homeName: string; homeFlag: string | null; homeOwner: OwnerBadge | null;
  awayName: string; awayFlag: string | null; awayOwner: OwnerBadge | null;
  kickoffAt: string | null; homeScore: number | null; awayScore: number | null;
  // Penalty-shootout score, surfaced beneath the result; null = no shootout.
  homePenalties: number | null; awayPenalties: number | null;
  status: "scheduled" | "live" | "final";
}

interface RosterLite { user_id: string; team_ids: string[]; }
interface OwnerProfileLite { id: string; display_name: string; avatar_url: string | null; }

function emptyBreakdown(): ScoreLite["breakdown"] {
  return { group: 0, group_qualify: 0, group_win: 0, knockout: 0, bonus: 0, by_team: [] };
}

// Ranked leaderboard. One row per profile (managers with no score row score 0).
// by_team UUIDs are resolved to name/flag and sorted by points desc. Rows are
// sorted by total desc with an alphabetical tie-break, then assigned standard
// competition ranking (ties share a rank, the next rank skips: 1, 2, 2, 4).
export function buildLeaderboard(
  scores: ScoreLite[],
  profiles: ProfileLite[],
  teams: TeamLite[],
  selfUserId: string,
): LeaderRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const scoreByUser = new Map(scores.map((s) => [s.user_id, s]));

  const rows = profiles.map((p) => {
    const s = scoreByUser.get(p.id);
    const b = s?.breakdown ?? emptyBreakdown();
    const byTeam: LeaderTeamPoints[] = b.by_team
      .map((bt) => {
        const t = teamById.get(bt.team);
        return {
          name: t?.name ?? "—",
          flagUrl: t?.flag_url ?? null,
          phase: bt.phase,
          points: bt.points,
        };
      })
      .sort((a, b2) => b2.points - a.points);
    const avatarUrl = p.avatar_url?.trim() || null;
    return {
      userId: p.id,
      displayName: p.display_name,
      isSelf: p.id === selfUserId,
      avatarUrl,
      total: s?.total_points ?? 0,
      group: b.group,
      groupQualify: b.group_qualify ?? 0,
      groupWin: b.group_win ?? 0,
      knockout: b.knockout,
      bonus: b.bonus,
      byTeam,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));

  let lastTotal: number | null = null;
  let lastRank = 0;
  return rows.map((r, i) => {
    const rank = lastTotal !== null && r.total === lastTotal ? lastRank : i + 1;
    lastTotal = r.total;
    lastRank = rank;
    return { rank, ...r };
  });
}

// A team's standing on a roster card. "kept" teams the manager drafted and still
// holds; "claimed" free agents picked up in the knockout swap (badged NEW);
// "dropped" group teams given up in the swap (shown dimmed/struck-through). Pre
// knockout-lock everything is "kept".
export type RosterTeamStatus = "kept" | "claimed" | "dropped";
export interface RosterCardTeam {
  teamId: string;
  status: RosterTeamStatus;
}
interface RosterCardInput {
  team_ids: string[]; // current roster (kept + claimed), in display order
  claimed_team_ids?: string[]; // subset of team_ids picked up via the swap
  dropped_team_ids?: string[]; // group teams given up in the swap
}

// Orders a manager's roster-card teams: their live squad first (kept, then with
// claimed flagged), dropped teams last. Pure — drives both the home roster cards
// and the manager profile roster.
export function buildRosterCardTeams(roster: RosterCardInput): RosterCardTeam[] {
  const claimed = new Set(roster.claimed_team_ids ?? []);
  const live: RosterCardTeam[] = roster.team_ids.map((teamId) => ({
    teamId,
    status: claimed.has(teamId) ? "claimed" : "kept",
  }));
  const dropped: RosterCardTeam[] = (roster.dropped_team_ids ?? []).map((teamId) => ({
    teamId,
    status: "dropped",
  }));
  return [...live, ...dropped];
}

// Per-(manager, team) points for the dashboard roster cards, summed across
// ownership phases. Keyed `${userId}::${teamId}`. A team's group points sit on
// the group owner and its knockout points on the knockout owner, so a card shows
// exactly what that team has earned for that manager. Missing → treated as 0.
export function buildRosterTeamPoints(scores: ScoreLite[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of scores) {
    for (const bt of s.breakdown?.by_team ?? []) {
      const key = `${s.user_id}::${bt.team}`;
      out[key] = (out[key] ?? 0) + bt.points;
    }
  }
  return out;
}

// The viewer's teams joined with their standings, labelled and ordered for the
// "My teams" panel. Champion first, then still-alive teams (deepest stage
// first), eliminated teams last; alphabetical within a tier.
export function buildMyTeams(
  myTeamIds: string[],
  board: TeamLite[],
  standings: StandingLite[],
  droppedTeamIds: string[] = [],
): MyTeamStatus[] {
  const teamById = new Map(board.map((t) => [t.id, t]));
  const standingById = new Map(standings.map((s) => [s.team_id, s]));

  const enriched = myTeamIds.map((id) => {
    const t = teamById.get(id);
    const s = standingById.get(id);
    const stage: Stage = s?.furthest_stage ?? "group";
    const isChampion = s?.is_champion ?? false;
    const isEliminated = s?.is_eliminated ?? false;
    // "Qualified" surfaces only while still in the group stage — once an R32
    // fixture exists the stage label (Round of 32, …) already says as much.
    const isQualified = (s?.qualified ?? false) && stage === "group" && !isEliminated;
    const stageLabel = isChampion
      ? "Champion"
      : isEliminated
        ? "Eliminated"
        : isQualified
          ? "Qualified"
          : STAGE_LABELS[stage];
    const status: MyTeamStatus = {
      name: t?.name ?? "—",
      flagUrl: t?.flag_url ?? null,
      stageLabel,
      isEliminated,
      isChampion,
      isQualified,
      isDropped: false,
    };
    // bucket: champion(0) < alive(1) < eliminated(2)
    const bucket = isChampion ? 0 : isEliminated ? 2 : 1;
    return { status, bucket, depth: STAGE_DEPTH[stage] };
  });

  enriched.sort(
    (a, b) =>
      a.bucket - b.bucket ||
      b.depth - a.depth ||
      a.status.name.localeCompare(b.status.name),
  );

  // Teams dropped in the knockout swap trail the live squad, alphabetical.
  const dropped: MyTeamStatus[] = droppedTeamIds
    .map((id) => {
      const t = teamById.get(id);
      return {
        name: t?.name ?? "—",
        flagUrl: t?.flag_url ?? null,
        stageLabel: "Dropped",
        isEliminated: false,
        isChampion: false,
        isQualified: false,
        isDropped: true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...enriched.map((e) => e.status), ...dropped];
}

// Compact match strip: the most recent finished results and the next upcoming
// fixtures. Team UUIDs resolve to name/flag (null → "TBD"); group-stage fixtures
// get a "Group X" label, others the stage label.
export function buildMatchStrip(
  matches: MatchLite[],
  teams: TeamLite[],
  opts: {
    recent?: number;
    upcoming?: number;
    // Roster ownership + manager photos. Resolves each fixture's teams to the
    // owning manager so head-to-heads/clashes are visible at a glance.
    ownership?: { rosters: RosterLite[]; profiles: OwnerProfileLite[] };
  } = {},
): { recent: MatchStripItem[]; upcoming: MatchStripItem[] } {
  const recentN = opts.recent ?? 5;
  const upcomingN = opts.upcoming ?? 5;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  // Null kickoffs (unscheduled knockout fixtures) sort to the back of both lists.
  const ms = (s: string | null, missing: number) =>
    s ? new Date(s).getTime() : missing;

  // teamId → owner badge, but only for managers who actually uploaded a photo
  // (photo-only by design — no initials fallback in the compact strip). Rosters
  // track current ownership: group-stage until the knockout swap locks, then the
  // post-swap knockout snapshot (draft_state() flips phase at knockout_locked).
  const ownerByTeam = new Map<string, OwnerBadge>();
  if (opts.ownership) {
    const profileById = new Map(opts.ownership.profiles.map((p) => [p.id, p]));
    for (const r of opts.ownership.rosters) {
      const p = profileById.get(r.user_id);
      const avatarUrl = p?.avatar_url?.trim();
      if (!p || !avatarUrl) continue;
      for (const teamId of r.team_ids) {
        ownerByTeam.set(teamId, { avatarUrl, name: p.display_name });
      }
    }
  }

  const toItem = (m: MatchLite): MatchStripItem => {
    const home = m.home_team_id ? teamById.get(m.home_team_id) : undefined;
    const away = m.away_team_id ? teamById.get(m.away_team_id) : undefined;
    const stageLabel =
      m.stage === "group" && m.group_letter ? `Group ${m.group_letter}` : STAGE_LABELS[m.stage];
    return {
      id: m.id,
      stageLabel,
      homeName: home?.name ?? "TBD",
      homeFlag: home?.flag_url ?? null,
      homeOwner: (m.home_team_id && ownerByTeam.get(m.home_team_id)) || null,
      awayName: away?.name ?? "TBD",
      awayFlag: away?.flag_url ?? null,
      awayOwner: (m.away_team_id && ownerByTeam.get(m.away_team_id)) || null,
      kickoffAt: m.kickoff_at,
      homeScore: m.home_score,
      awayScore: m.away_score,
      homePenalties: m.home_penalties ?? null,
      awayPenalties: m.away_penalties ?? null,
      status: m.status,
    };
  };

  const recent = matches
    .filter((m) => m.status === "final")
    .sort((a, b) => ms(b.kickoff_at, -Infinity) - ms(a.kickoff_at, -Infinity))
    .slice(0, recentN)
    .map(toItem);

  const upcoming = matches
    .filter((m) => m.status !== "final")
    .sort((a, b) => ms(a.kickoff_at, Infinity) - ms(b.kickoff_at, Infinity))
    .slice(0, upcomingN)
    .map(toItem);

  return { recent, upcoming };
}
