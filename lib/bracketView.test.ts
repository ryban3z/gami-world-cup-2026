import { describe, it, expect } from "vitest";
import { buildBracket, type BracketMatchLite, type BracketTeamLite } from "@/lib/bracketView";
import { BRACKET_SPINE, SPINE_BY_ID, R32_FEEDS } from "@/lib/bracket";

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

// ── R32_FEEDS must cover all 16 ties and fill every R16 slot exactly twice ──
describe("R32_FEEDS routing", () => {
  const r16Ids = new Set(BRACKET_SPINE.filter((n) => n.stage === "r16").map((n) => n.externalId));

  it("maps 16 R32 fixtures, each to a real R16 id", () => {
    const entries = Object.entries(R32_FEEDS);
    expect(entries).toHaveLength(16);
    for (const [, feed] of entries) expect(r16Ids.has(feed.r16)).toBe(true);
  });

  it("gives every R16 exactly two feeders — one side 0, one side 1", () => {
    for (const r16 of r16Ids) {
      const feeders = Object.values(R32_FEEDS).filter((f) => f.r16 === r16);
      expect(feeders.map((f) => f.side).sort()).toEqual([0, 1]);
    }
  });
});

const teams: BracketTeamLite[] = [
  { id: "TA", name: "Argentina", flag_url: "ar.png" },
  { id: "TB", name: "Brazil", flag_url: "br.png" },
  { id: "TC", name: "Canada", flag_url: "ca.png" },
  { id: "TD", name: "Denmark", flag_url: "dk.png" },
];

// A few R32 ties placed by R32_FEEDS, plus their R16. Slot = r16FlowIndex*2+side;
// the R16 flow order is [537375,537376,537379,537380,537377,537378,537381,537382],
// so 537415→slot0, 537416→slot1, 537417→slot2.
function fixtureMatches(): BracketMatchLite[] {
  return [
    r32("537415", "TA", "TB", "TA"), // →537375/0, resolved (Argentina advances)
    r32("537416", "TC", "TD", null), // →537375/1, PENDING (no winner)
    r32("537417", "TC", "TB", "TC"), // →537376/0, resolved
    // R16 537375 holds Argentina (home) & Brazil (away); Argentina advances.
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

  it("places each R32 in its locked slot/side by external_id, regardless of winner", () => {
    const v = buildBracket(fixtureMatches(), teams);
    const r32col = v.columns.find((c) => c.stage === "r32")!;
    // Ordered by slot index: 537415 (slot 0), 537416 (slot 1), 537417 (slot 2).
    expect(r32col.matches.map((m) => m.externalId)).toEqual(["537415", "537416", "537417"]);
  });

  it("places a pending (unplayed) R32 in its exact slot, not appended/guessed", () => {
    const v = buildBracket(fixtureMatches(), teams);
    const r32col = v.columns.find((c) => c.stage === "r32")!;
    // 537416 has no winner but still sits at its locked slot 1 (between 537415 and 537417).
    expect(r32col.matches[1].externalId).toBe("537416");
    expect(r32col.matches[1].home.name).toBe("Canada"); // teams resolve even while pending
    expect("pendingR32" in v).toBe(false); // no detached bucket
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
