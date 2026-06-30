// Pure view-layer helper for the knockout bracket page ("road to the final").
// No IO. Joins already-fetched match rows onto the static BRACKET_SPINE
// (lib/bracket.ts) and returns render-ready columns: the left half of the draw,
// the centre (final + third place), and the right half. Round-of-32 fixtures are
// attached to their Round-of-16 parent dynamically — an R32 match feeds the R16
// slot held by its winner — so no fragile R32 match-number mapping is needed.

import { type Stage, STAGE_LABELS } from "@/lib/leaderboardView";
import { BRACKET_SPINE, SPINE_BY_ID, FINAL_EXTERNAL_ID, THIRD_PLACE_EXTERNAL_ID } from "@/lib/bracket";

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
  leftColumns: BracketColumn[]; // [R32, R16, QF, SF] for the top half of the draw
  rightColumns: BracketColumn[]; // mirror; the component renders these reversed
  final: BracketMatchCell;
  thirdPlace: BracketMatchCell;
  // R32 fixtures not yet resolved (or whose winner isn't placed in an R16 slot
  // yet), so they can't be slotted into a half. Shown in a holding strip.
  pendingR32: BracketMatchCell[];
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

  // ── Round of 32 → Round of 16 attachment (data-driven by winner) ──
  // For each resolved R32 match, the R16 match that contains its winner is its
  // parent. We index R16 slots by the team ids that occupy them.
  const r16Ids = new Set(
    BRACKET_SPINE.filter((n) => n.stage === "r16").map((n) => n.externalId),
  );
  // teamId → R16 external_id holding that team (home or away).
  const r16ByTeam = new Map<string, string>();
  for (const id of r16Ids) {
    const m = matchById.get(id);
    if (!m) continue;
    if (m.home_team_id) r16ByTeam.set(m.home_team_id, id);
    if (m.away_team_id) r16ByTeam.set(m.away_team_id, id);
  }
  // r16 external_id → { home: r32 cell, away: r32 cell } aligned to the R16 slot.
  const r32ByR16 = new Map<string, { home?: BracketMatchCell; away?: BracketMatchCell }>();
  const pendingR32: BracketMatchCell[] = [];
  const r32Matches = matches
    .filter((m) => m.stage === "r32")
    .sort((a, b) => msKickoff(a.kickoff_at) - msKickoff(b.kickoff_at));
  for (const m of r32Matches) {
    const cell = cellFor(m.external_id, "r32", "TBD", "TBD");
    const r16Id = m.winner_team_id ? r16ByTeam.get(m.winner_team_id) : undefined;
    if (!r16Id) {
      pendingR32.push(cell);
      continue;
    }
    const r16 = matchById.get(r16Id)!;
    const slot = r32ByR16.get(r16Id) ?? {};
    // Align the R32 under whichever side of the R16 its winner occupies.
    if (m.winner_team_id === r16.home_team_id) slot.home = cell;
    else slot.away = cell;
    r32ByR16.set(r16Id, slot);
  }

  // ── Assemble the half columns ──
  const half = (side: "left" | "right"): BracketColumn[] => {
    const nodes = BRACKET_SPINE.filter((n) => n.half === side);
    const r16Nodes = nodes.filter((n) => n.stage === "r16").sort((a, b) => a.order - b.order);
    const qfNodes = nodes.filter((n) => n.stage === "qf").sort((a, b) => a.order - b.order);
    const sfNodes = nodes.filter((n) => n.stage === "sf").sort((a, b) => a.order - b.order);

    // R32 column: each R16 parent contributes its [home, away] feeders in order,
    // keeping the R32 fixtures vertically aligned under their R16 slot.
    const r32: BracketMatchCell[] = [];
    for (const n of r16Nodes) {
      const slot = r32ByR16.get(n.externalId) ?? {};
      if (slot.home) r32.push(slot.home);
      if (slot.away) r32.push(slot.away);
    }

    const cols: BracketColumn[] = [];
    if (r32.length) cols.push({ stage: "r32", label: STAGE_LABELS.r32, matches: r32 });
    cols.push({ stage: "r16", label: STAGE_LABELS.r16, matches: r16Nodes.map((n) => spineCell(n.externalId)) });
    cols.push({ stage: "qf", label: STAGE_LABELS.qf, matches: qfNodes.map((n) => spineCell(n.externalId)) });
    cols.push({ stage: "sf", label: STAGE_LABELS.sf, matches: sfNodes.map((n) => spineCell(n.externalId)) });
    return cols;
  };

  return {
    leftColumns: half("left"),
    rightColumns: half("right"),
    final: cellFor(FINAL_EXTERNAL_ID, "final", PLACEHOLDER.final, PLACEHOLDER.final),
    thirdPlace: cellFor(THIRD_PLACE_EXTERNAL_ID, "third_place", PLACEHOLDER.third_place, PLACEHOLDER.third_place),
    pendingR32,
  };
}

// Null kickoffs sort last; a missing date shouldn't crash the ordering.
function msKickoff(s: string | null): number {
  return s ? new Date(s).getTime() : Number.POSITIVE_INFINITY;
}
