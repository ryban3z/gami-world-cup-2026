import { describe, it, expect } from "vitest";
import { buildBracket, type BracketMatchLite, type BracketTeamLite } from "@/lib/bracketView";
import { BRACKET_SPINE, SPINE_BY_ID } from "@/lib/bracket";

// ── Topology sanity: the static spine must be a well-formed split bracket ──
describe("BRACKET_SPINE topology", () => {
  it("has 8 R16, 4 QF, 2 SF, 1 final, 1 third place", () => {
    const by = (s: string) => BRACKET_SPINE.filter((n) => n.stage === s).length;
    expect(by("r16")).toBe(8);
    expect(by("qf")).toBe(4);
    expect(by("sf")).toBe(2);
    expect(by("final")).toBe(1);
    expect(by("third_place")).toBe(1);
  });

  it("every non-final node feeds an existing node, two feeders each", () => {
    const feederCount = new Map<string, number>();
    for (const n of BRACKET_SPINE) {
      if (n.stage === "final" || n.stage === "third_place") {
        expect(n.feedsInto).toBeNull();
        continue;
      }
      expect(n.feedsInto).not.toBeNull();
      expect(SPINE_BY_ID.has(n.feedsInto!)).toBe(true);
      feederCount.set(n.feedsInto!, (feederCount.get(n.feedsInto!) ?? 0) + 1);
    }
    // Final, every SF and every QF must collect exactly two feeders.
    for (const n of BRACKET_SPINE) {
      if (n.stage === "qf" || n.stage === "sf" || n.stage === "final") {
        expect(feederCount.get(n.externalId)).toBe(2);
      }
    }
  });

  it("splits into two balanced halves of 4 R16 + 2 QF + 1 SF", () => {
    for (const side of ["left", "right"] as const) {
      const nodes = BRACKET_SPINE.filter((n) => n.half === side);
      expect(nodes.filter((n) => n.stage === "r16").length).toBe(4);
      expect(nodes.filter((n) => n.stage === "qf").length).toBe(2);
      expect(nodes.filter((n) => n.stage === "sf").length).toBe(1);
    }
  });
});

// ── Test fixture: a tiny but complete bracket. Team ids encode their path so the
// expected propagation is easy to read (e.g. "L-r16a-home").
const teams: BracketTeamLite[] = [
  { id: "TA", name: "Argentina", flag_url: "ar.png" },
  { id: "TB", name: "Brazil", flag_url: "br.png" },
  { id: "TC", name: "Canada", flag_url: "ca.png" },
  { id: "TD", name: "Denmark", flag_url: "dk.png" },
];

// Left-half R16 537375 (Argentina v Brazil); the two R32 matches whose winners
// are Argentina and Brazil should attach beneath it.
function fixtureMatches(): BracketMatchLite[] {
  return [
    // R32: 537417 won by Argentina, 537423 won by Brazil → both feed R16 537375.
    r32("537417", "TA", "X1", "TA"),
    r32("537423", "TB", "X2", "TB"),
    // An R32 with no winner yet → pending.
    r32("537415", null, null, null),
    // R16 537375 holds Argentina (home) & Brazil (away), Argentina advances.
    spine("537375", "r16", "TA", "TB", "TA", 2, 1),
  ];
}

function r32(
  id: string,
  home: string | null,
  away: string | null,
  winner: string | null,
): BracketMatchLite {
  return {
    external_id: id, stage: "r32", home_team_id: home, away_team_id: away,
    home_score: winner ? 1 : null, away_score: winner ? 0 : null,
    winner_team_id: winner, status: winner ? "final" : "scheduled", kickoff_at: "2026-06-29T00:00:00Z",
  };
}
function spine(
  id: string, stage: BracketMatchLite["stage"], home: string, away: string,
  winner: string | null, hs: number | null, as: number | null,
): BracketMatchLite {
  return {
    external_id: id, stage, home_team_id: home, away_team_id: away,
    home_score: hs, away_score: as, winner_team_id: winner,
    status: winner ? "final" : "scheduled", kickoff_at: "2026-07-04T00:00:00Z",
  };
}

// Small helper: find a spine match in the flat column list by external id.
function findMatch(v: ReturnType<typeof buildBracket>, externalId: string) {
  for (const c of v.columns) {
    const m = c.matches.find((x) => x.externalId === externalId);
    if (m) return m;
  }
  return undefined;
}

describe("buildBracket", () => {
  it("emits a single left→right flow with the final/third as the right-most pair", () => {
    const v = buildBracket([], teams);
    // No R32 yet → first column is R16; R32 only appears once there are R32 rows.
    expect(v.columns.map((c) => c.stage)).toEqual(["r16", "qf", "sf"]);
    expect(v.columns.find((c) => c.stage === "r16")!.matches.length).toBe(8);
    expect(v.final.externalId).toBe("537390");
    expect(v.thirdPlace.externalId).toBe("537389");
  });

  it("orders the R16 column left-half-first (single top-to-bottom flow)", () => {
    const v = buildBracket([], teams);
    expect(v.columns.find((c) => c.stage === "r16")!.matches.map((m) => m.externalId)).toEqual([
      "537375", "537376", "537379", "537380", "537377", "537378", "537381", "537382",
    ]);
  });

  it("shows placeholders before slots resolve", () => {
    const v = buildBracket([], teams);
    const r16 = v.columns[0].matches[0];
    expect(r16.home.name).toBeNull();
    expect(r16.home.placeholder).toBe("R32 winner");
    expect(v.final.home.placeholder).toBe("SF winner");
  });

  it("resolves team names, flags and the winner highlight", () => {
    const v = buildBracket(fixtureMatches(), teams);
    const r16 = findMatch(v, "537375")!;
    expect(r16.home.name).toBe("Argentina");
    expect(r16.home.flag).toBe("ar.png");
    expect(r16.home.isWinner).toBe(true);
    expect(r16.away.isWinner).toBe(false);
  });

  it("drops a resolved R32 into its exact parent-aligned slot", () => {
    const v = buildBracket(fixtureMatches(), teams);
    const r32col = v.columns.find((c) => c.stage === "r32")!;
    // 537375 is the first R16 flow slot (index 0): home feeder at slot 0, away at slot 1.
    expect(r32col.matches[0].externalId).toBe("537417"); // Argentina's R32 (home side)
    expect(r32col.matches[1].externalId).toBe("537423"); // Brazil's R32 (away side)
  });

  it("keeps unresolved R32 fixtures in the R32 column (no detached bucket)", () => {
    const v = buildBracket(fixtureMatches(), teams);
    const r32col = v.columns.find((c) => c.stage === "r32")!;
    const ids = r32col.matches.map((m) => m.externalId);
    expect(ids).toContain("537415"); // pending, still in the bracket
    expect(ids).toContain("537417"); // resolved
    expect(r32col.matches).toHaveLength(3); // all three R32 rendered, none dropped
    expect("pendingR32" in v).toBe(false);
  });

  it("surfaces penalty-decided winners", () => {
    const m: BracketMatchLite = {
      external_id: "537390", stage: "final", home_team_id: "TA", away_team_id: "TB",
      home_score: 1, away_score: 1, home_penalties: 4, away_penalties: 3,
      winner_team_id: "TA", status: "final", kickoff_at: null,
    };
    const v = buildBracket([m], teams);
    expect(v.final.home.penalties).toBe(4);
    expect(v.final.away.penalties).toBe(3);
    expect(v.final.home.isWinner).toBe(true);
  });

  it("attaches the knockout owner (name + photo) to each team", () => {
    const v = buildBracket(fixtureMatches(), teams, {
      rosters: [{ user_id: "u1", display_name: "Ada", team_ids: ["TA"] }],
      profiles: [{ id: "u1", display_name: "Ada", avatar_url: " https://pic " }],
    });
    const r16 = findMatch(v, "537375")!;
    expect(r16.home.owner).toEqual({ name: "Ada", avatarUrl: "https://pic" });
    expect(r16.away.owner).toBeNull(); // Brazil unowned in this fixture
  });

  it("owner name survives without a photo (initials fallback)", () => {
    const v = buildBracket(fixtureMatches(), teams, {
      rosters: [{ user_id: "u1", display_name: "Bo", team_ids: ["TA"] }],
      profiles: [{ id: "u1", display_name: "Bo", avatar_url: null }],
    });
    const r16 = findMatch(v, "537375")!;
    expect(r16.home.owner).toEqual({ name: "Bo", avatarUrl: null });
  });
});
