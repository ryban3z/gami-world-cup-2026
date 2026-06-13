import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchWcMatches, mapApiMatch, type MappedMatch } from "@/lib/footballData";
import {
  deriveStandings, computeScores,
  type MatchRow, type OwnershipRow, type CategoryRow, type PredictionRow,
  type ScoringRule, type ScoringConfig,
} from "@/lib/scoring";

type DB = ReturnType<typeof createServiceClient>;

export async function runRecalc(db: DB = createServiceClient()) {
  const [matchesQ, ownershipQ, catsQ, predsQ, rulesQ, cfgQ, profilesQ] = await Promise.all([
    db.from("matches").select("external_id, stage, home_team_id, away_team_id, winner_team_id, status"),
    db.from("team_ownership").select("user_id, team_id, phase"),
    db.from("bonus_categories").select("id, key, resolved_answer"),
    db.from("bonus_predictions").select("user_id, category_id, pick_value").eq("is_active", true),
    db.from("scoring_rules").select("stage, points"),
    db.from("scoring_config").select("group_qualify_pts, group_win_pts, bonus_correct_pts, champion_pts").eq("id", 1).single(),
    db.from("profiles").select("id"),
  ]);

  const matches = (matchesQ.data ?? []) as MatchRow[];
  const standings = deriveStandings(matches);
  const now = new Date().toISOString();
  if (standings.length) {
    await db.from("team_standings").upsert(
      standings.map((s) => ({ ...s, updated_at: now })),
      { onConflict: "team_id" },
    );
  }

  const scores = computeScores({
    userIds: (profilesQ.data ?? []).map((p) => p.id),
    standings,
    matches,
    ownership: (ownershipQ.data ?? []) as OwnershipRow[],
    categories: (catsQ.data ?? []) as CategoryRow[],
    predictions: (predsQ.data ?? []) as PredictionRow[],
    rules: (rulesQ.data ?? []) as ScoringRule[],
    config: cfgQ.data as ScoringConfig,
  });
  if (scores.length) {
    await db.from("scores").upsert(
      scores.map((s) => ({ user_id: s.user_id, total_points: s.total_points, breakdown: s.breakdown, updated_at: now })),
      { onConflict: "user_id" },
    );
  }
  return { teams: standings.length, scores: scores.length };
}

export async function runIngest() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("missing FOOTBALL_DATA_TOKEN");
  const db = createServiceClient();

  const apiMatches = await fetchWcMatches(token);
  // Skip fixtures in stages we don't recognise (and surface them in the cron
  // log / admin result) rather than letting one odd fixture abort the ingest.
  const mapped: MappedMatch[] = [];
  const skippedStages = new Set<string>();
  for (const am of apiMatches) {
    const m = mapApiMatch(am);
    if (m) mapped.push(m);
    else skippedStages.add(am.stage);
  }

  const [{ data: teams }, { data: existing }] = await Promise.all([
    db.from("teams").select("id, external_id"),
    db.from("matches").select("external_id, is_manual_override"),
  ]);
  const teamByExt = new Map((teams ?? []).filter((t) => t.external_id).map((t) => [t.external_id as string, t.id]));
  const overridden = new Set((existing ?? []).filter((m) => m.is_manual_override).map((m) => m.external_id));
  const knownExt = new Set((existing ?? []).map((m) => m.external_id));
  const now = new Date().toISOString();

  for (const m of mapped) {
    const homeId = m.homeExternalId ? teamByExt.get(m.homeExternalId) ?? null : null;
    const awayId = m.awayExternalId ? teamByExt.get(m.awayExternalId) ?? null : null;
    const winnerId = m.winner === "HOME_TEAM" ? homeId : m.winner === "AWAY_TEAM" ? awayId : null;
    const teamFill = { home_team_id: homeId, away_team_id: awayId, kickoff_at: m.kickoffAt, updated_at: now };
    const scoreFields = overridden.has(m.externalId)
      ? {}
      : { status: m.status, home_score: m.homeScore, away_score: m.awayScore, winner_team_id: winnerId };

    if (knownExt.has(m.externalId)) {
      await db.from("matches").update({ ...teamFill, ...scoreFields }).eq("external_id", m.externalId);
    } else {
      await db.from("matches").insert({
        external_id: m.externalId, stage: m.stage, group_letter: m.groupLetter,
        status: m.status, ...teamFill, ...scoreFields,
      });
    }
  }

  const recalc = await runRecalc(db);
  await db.from("game_config").update({ last_results_sync_at: now }).eq("id", 1);
  return { matches: mapped.length, skippedStages: [...skippedStages], ...recalc };
}
