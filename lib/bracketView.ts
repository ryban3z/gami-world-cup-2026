// Pure view-layer helper for the knockout bracket page ("road to the final").
// No IO. Joins already-fetched match rows onto the static BRACKET_SPINE
// (lib/bracket.ts) and returns render-ready columns: the left half of the draw,
// the centre (final + third place), and the right half. Round-of-32 fixtures are
// attached to their Round-of-16 parent dynamically — an R32 match feeds the R16
// slot held by its winner — so no fragile R32 match-number mapping is needed.

import { type Stage, STAGE_LABELS } from "@/lib/leaderboardView";
import { SPINE_BY_ID, FINAL_EXTERNAL_ID, THIRD_PLACE_EXTERNAL_ID, spineFlowOrder, R32_FEEDS } from "@/lib/bracket";

// ── Structural "lite" inputs (decoupled from Supabase row shapes) ──
export interface BracketMatchLite {
  external_id: string;
  stage: Stage;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  home_penalties?: number | null;
  away_penalties?: number | null;
  winner_team_id: string | null;
  status: "scheduled" | "live" | "final";
  kickoff_at: string | null;
}
export interface BracketTeamLite {
  id: string;
  name: string;
  flag_url: string | null;
}
// Current ownership comes from draft_state().rosters (group-stage until the
// knockout swap locks, then the knockout snapshot); profiles supply photos.
export interface BracketRosterLite {
  user_id: string;
  display_name: string;
  team_ids: string[];
}
export interface BracketProfileLite {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

// ── Outputs ──
export interface BracketOwner {
  name: string;
  avatarUrl: string | null; // null → render initials chip instead of a photo
}
export interface BracketTeamCell {
  name: string | null; // resolved team name, or null before the slot is filled
  flag: string | null;
  placeholder: string; // shown when name is null, e.g. "R32 winner"
  score: number | null;
  penalties: number | null;
  isWinner: boolean;
  owner: BracketOwner | null;
}
export interface BracketMatchCell {
  externalId: string;
  stage: Stage;
  home: BracketTeamCell;
  away: BracketTeamCell;
  status: "scheduled" | "live" | "final";
}
export interface BracketColumn {
  stage: Stage;
  label: string; // STAGE_LABELS[stage]
  matches: BracketMatchCell[]; // top-to-bottom
}
export interface BracketView {
  columns: BracketColumn[]; // [R32, R16, QF, SF], left→right, each top-to-bottom
  final: BracketMatchCell; // right-most column…
  thirdPlace: BracketMatchCell; // …stacked under the final
}

// What feeds a spine slot, for a friendly placeholder before the team is known.
const PLACEHOLDER: Record<Stage, string> = {
  group: "TBD",
  r32: "TBD",
  r16: "R32 winner",
  qf: "R16 winner",
  sf: "QF winner",
  third_place: "SF runner-up",
  final: "SF winner",
};

export function buildBracket(
  matches: BracketMatchLite[],
  teams: BracketTeamLite[],
  ownership?: { rosters: BracketRosterLite[]; profiles: BracketProfileLite[] },
): BracketView {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchById = new Map(matches.map((m) => [m.external_id, m]));

  // teamId → owning manager (name + optional photo). Rosters carry the current
  // owner; profiles add the avatar. Name falls back to the roster's display_name
  // so the head-to-head reads even for managers without a photo.
  const ownerByTeam = new Map<string, BracketOwner>();
  if (ownership) {
    const profileById = new Map(ownership.profiles.map((p) => [p.id, p]));
    for (const r of ownership.rosters) {
      const avatarUrl = profileById.get(r.user_id)?.avatar_url?.trim() || null;
      const owner: BracketOwner = { name: r.display_name, avatarUrl };
      for (const teamId of r.team_ids) ownerByTeam.set(teamId, owner);
    }
  }

  const teamCell = (
    teamId: string | null,
    winnerId: string | null,
    score: number | null,
    penalties: number | null | undefined,
    placeholder: string,
  ): BracketTeamCell => {
    const t = teamId ? teamById.get(teamId) : undefined;
    return {
      name: t?.name ?? null,
      flag: t?.flag_url ?? null,
      placeholder,
      score,
      penalties: penalties ?? null,
      isWinner: teamId != null && winnerId != null && teamId === winnerId,
      owner: (teamId && ownerByTeam.get(teamId)) || null,
    };
  };

  // Build a match cell for an external_id. `homePh`/`awayPh` are the per-side
  // placeholders (usually identical; differ only for the third-place play-off).
  const cellFor = (
    externalId: string,
    stage: Stage,
    homePh: string,
    awayPh: string,
  ): BracketMatchCell => {
    const m = matchById.get(externalId);
    if (!m) {
      const empty = (ph: string): BracketTeamCell => ({
        name: null, flag: null, placeholder: ph, score: null, penalties: null, isWinner: false, owner: null,
      });
      return { externalId, stage, home: empty(homePh), away: empty(awayPh), status: "scheduled" };
    }
    return {
      externalId,
      stage,
      home: teamCell(m.home_team_id, m.winner_team_id, m.home_score, m.home_penalties, homePh),
      away: teamCell(m.away_team_id, m.winner_team_id, m.away_score, m.away_penalties, awayPh),
      status: m.status,
    };
  };

  const spineCell = (externalId: string): BracketMatchCell => {
    const node = SPINE_BY_ID.get(externalId)!;
    const ph = PLACEHOLDER[node.stage];
    return cellFor(externalId, node.stage, ph, ph);
  };

  // Single left→right flow order for the spine rounds (left half stacked above
  // the right half), so each round is one top-to-bottom column.
  const r16Flow = spineFlowOrder("r16"); // 8 ids, defines the R32 slot layout
  const r16FlowIndex = new Map(r16Flow.map((id, i) => [id, i]));

  // ── Round of 32 → Round of 16 placement (static, locked routes) ──
  // Each R32 fixture has a fixed destination in R32_FEEDS, so it lands in its
  // exact slot at `r16FlowIndex*2 + side` whether or not it's been played — no
  // guessing for pending ties. (An unmapped id — shouldn't occur — is skipped.)
  const r32Slots: (BracketMatchCell | undefined)[] = new Array(r16Flow.length * 2);
  for (const m of matches) {
    if (m.stage !== "r32") continue;
    const feed = R32_FEEDS[m.external_id];
    const flowIdx = feed ? r16FlowIndex.get(feed.r16) : undefined;
    if (feed == null || flowIdx == null) continue;
    r32Slots[flowIdx * 2 + feed.side] = cellFor(m.external_id, "r32", "TBD", "TBD");
  }
  const r32Column = r32Slots.filter((c): c is BracketMatchCell => c != null);

  const column = (stage: "r16" | "qf" | "sf"): BracketColumn => ({
    stage,
    label: STAGE_LABELS[stage],
    matches: spineFlowOrder(stage).map((id) => spineCell(id)),
  });

  const columns: BracketColumn[] = [];
  if (r32Column.length) columns.push({ stage: "r32", label: STAGE_LABELS.r32, matches: r32Column });
  columns.push(column("r16"), column("qf"), column("sf"));

  return {
    columns,
    final: cellFor(FINAL_EXTERNAL_ID, "final", PLACEHOLDER.final, PLACEHOLDER.final),
    thirdPlace: cellFor(THIRD_PLACE_EXTERNAL_ID, "third_place", PLACEHOLDER.third_place, PLACEHOLDER.third_place),
  };
}
