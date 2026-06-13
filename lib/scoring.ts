// Pure scoring engine. No IO. lib/pipeline.ts reads inputs via the service-role
// client, calls these, and writes team_standings + scores.

export type MatchStage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";
export type OwnerPhase = "group" | "knockout";

// Team-pick categories use a dropdown of seeded team names (safe to compare directly);
// the rest are free text (normalized before comparison). Mirrors PredictionForm.
export const TEAM_PICK_KEYS = new Set(["tournament_winner", "runner_up", "wooden_spoon"]);

const STAGE_RANK: Record<MatchStage, number> = {
  group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third_place: 4, final: 5,
};

export interface MatchRow {
  external_id: string;
  stage: MatchStage;
  home_team_id: string | null;
  away_team_id: string | null;
  winner_team_id: string | null;
  status: "scheduled" | "live" | "final";
}

export interface StandingRow {
  team_id: string;
  furthest_stage: MatchStage;
  is_eliminated: boolean;
  is_champion: boolean;
}

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function deriveStandings(matches: MatchRow[]): StandingRow[] {
  const acc = new Map<string, { stage: MatchStage; match: MatchRow }>();
  const championOf = (m: MatchRow) =>
    m.stage === "final" && m.status === "final" ? m.winner_team_id : null;
  let champion: string | null = null;

  for (const m of matches) {
    const c = championOf(m);
    if (c) champion = c;
    if (m.stage === "third_place") continue; // never advances furthest beyond sf
    for (const team of [m.home_team_id, m.away_team_id]) {
      if (!team) continue;
      const cur = acc.get(team);
      if (!cur || STAGE_RANK[m.stage] > STAGE_RANK[cur.stage]) {
        acc.set(team, { stage: m.stage, match: m });
      }
    }
  }

  const rows: StandingRow[] = [];
  for (const [team_id, { stage, match }] of acc) {
    const is_champion = team_id === champion;
    const is_eliminated =
      !is_champion &&
      stage !== "group" &&
      match.status === "final" &&
      match.winner_team_id !== team_id;
    rows.push({ team_id, furthest_stage: stage, is_eliminated, is_champion });
  }
  return rows;
}

export interface OwnershipRow {
  user_id: string;
  team_id: string;
  phase: OwnerPhase;
}
export interface CategoryRow {
  id: string;
  key: string;
  resolved_answer: string | null;
}
export interface PredictionRow {
  user_id: string;
  category_id: string;
  pick_value: string;
}
export interface ScoringRule {
  stage: MatchStage;
  points: number;
}
export interface ScoringConfig {
  group_qualify_pts: number;
  group_win_pts: number;
  bonus_correct_pts: number;
  champion_pts: number;
}

export interface ComputeInput {
  userIds: string[];
  standings: StandingRow[];
  matches: MatchRow[];
  ownership: OwnershipRow[];
  categories: CategoryRow[];
  predictions: PredictionRow[];
  rules: ScoringRule[];
  config: ScoringConfig;
}

export interface TeamPoints {
  team: string;
  phase: "group" | "knockout";
  points: number;
}
export interface ScoreBreakdown {
  group: number;
  knockout: number;
  bonus: number;
  by_team: TeamPoints[];
}
export interface ComputedScore {
  user_id: string;
  total_points: number;
  breakdown: ScoreBreakdown;
}

export function computeScores(input: ComputeInput): ComputedScore[] {
  const { userIds, standings, matches, ownership, categories, predictions, rules, config } = input;

  const groupOwner = new Map<string, string>();
  const knockoutOwner = new Map<string, string>();
  for (const o of ownership) {
    (o.phase === "group" ? groupOwner : knockoutOwner).set(o.team_id, o.user_id);
  }
  const koOwner = (team: string) => knockoutOwner.get(team) ?? groupOwner.get(team) ?? null;
  const ladder = new Map(rules.map((r) => [r.stage, r.points]));

  const acc = new Map<string, ScoreBreakdown>();
  for (const id of userIds) acc.set(id, { group: 0, knockout: 0, bonus: 0, by_team: [] });
  const ensure = (id: string) => {
    let b = acc.get(id);
    if (!b) { b = { group: 0, knockout: 0, bonus: 0, by_team: [] }; acc.set(id, b); }
    return b;
  };

  // Group-stage points (qualify + per-win) accrue to the phase='group' owner and
  // are merged into a single per-team line; the knockout ladder is separate and
  // routes to the knockout owner.
  const groupPtsByTeam = new Map<string, number>();
  const addGroupPts = (team: string, pts: number) => {
    if (pts <= 0 || !groupOwner.has(team)) return;
    groupPtsByTeam.set(team, (groupPtsByTeam.get(team) ?? 0) + pts);
  };

  for (const s of standings) {
    const qualified = STAGE_RANK[s.furthest_stage] >= STAGE_RANK["r32"];
    if (qualified) addGroupPts(s.team_id, config.group_qualify_pts);

    const ladderPts = (ladder.get(s.furthest_stage) ?? 0) + (s.is_champion ? config.champion_pts : 0);
    if (ladderPts > 0) {
      const owner = koOwner(s.team_id);
      if (owner) {
        const b = ensure(owner);
        b.knockout += ladderPts;
        b.by_team.push({ team: s.team_id, phase: "knockout", points: ladderPts });
      }
    }
  }

  // Each finished group-stage win earns group_win_pts for the team's group owner.
  for (const m of matches) {
    if (m.stage !== "group" || m.status !== "final" || !m.winner_team_id) continue;
    addGroupPts(m.winner_team_id, config.group_win_pts);
  }

  for (const [team, pts] of groupPtsByTeam) {
    const b = ensure(groupOwner.get(team)!);
    b.group += pts;
    b.by_team.push({ team, phase: "group", points: pts });
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const p of predictions) {
    const cat = catById.get(p.category_id);
    if (!cat || !cat.resolved_answer) continue;
    const key = `${p.user_id}:${p.category_id}`;
    if (seen.has(key)) continue;
    const isTeamPick = TEAM_PICK_KEYS.has(cat.key);
    const match = isTeamPick
      ? p.pick_value.trim() === cat.resolved_answer.trim()
      : normalizeAnswer(p.pick_value) === normalizeAnswer(cat.resolved_answer);
    if (match) {
      seen.add(key);
      ensure(p.user_id).bonus += config.bonus_correct_pts;
    }
  }

  return userIds.map((user_id) => {
    const b = acc.get(user_id)!;
    return { user_id, total_points: b.group + b.knockout + b.bonus, breakdown: b };
  });
}
