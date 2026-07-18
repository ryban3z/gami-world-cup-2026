import { describe, it, expect } from "vitest";
import { buildFinalResults } from "@/lib/finalResultsView";
import { buildLeaderboard } from "@/lib/leaderboardView";

const teams = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "France", flag_url: "fr.png" },
  { id: "t3", name: "Brazil", flag_url: null },
];
const profiles = [
  { id: "u1", display_name: "Ada" },
  { id: "u2", display_name: "Bob" },
  { id: "u3", display_name: "Cy" },
];

function score(user_id: string, total: number, by_team: any[] = []) {
  return {
    user_id,
    total_points: total,
    breakdown: { group: 0, knockout: 0, bonus: 0, by_team },
  };
}

// Convenience: build ranked rows the way the real pages do, then feed results.
function results(
  scores: any[],
  selfId: string,
  standings: any[] = [],
  knockoutOwners: any[] = [],
  categories: any[] = [],
  predictions: any[] = [],
) {
  const rows = buildLeaderboard(scores, profiles, teams, selfId);
  return buildFinalResults(
    rows,
    standings,
    teams,
    knockoutOwners,
    profiles,
    categories,
    predictions,
  );
}

describe("buildFinalResults", () => {
  it("builds a podium of the top three, ranked", () => {
    const r = results([score("u2", 30), score("u1", 20), score("u3", 10)], "u3");
    expect(r.podium.map((p) => [p.rank, p.displayName])).toEqual([
      [1, "Bob"],
      [2, "Ada"],
      [3, "Cy"],
    ]);
    expect(r.podium.find((p) => p.displayName === "Cy")!.isSelf).toBe(true);
    expect(r.champions).toEqual(["Bob"]);
  });

  it("names all co-champions when the top is tied", () => {
    // Ada & Bob tie at 30 (alpha order), Cy last.
    const r = results([score("u1", 30), score("u2", 30), score("u3", 5)], "u1");
    expect(r.champions).toEqual(["Ada", "Bob"]);
  });

  it("flags the last-place manager as the wooden spoon (ties included)", () => {
    const r = results([score("u1", 30), score("u2", 8), score("u3", 8)], "u1");
    expect(r.woodenSpoon.sort()).toEqual(["Bob", "Cy"]);
  });

  it("has no wooden spoon in a one-player pool", () => {
    const solo = [{ id: "u1", display_name: "Ada" }];
    const rows = buildLeaderboard([score("u1", 5)], solo, teams, "u1");
    const r = buildFinalResults(rows, [], teams, [], solo, [], []);
    expect(r.woodenSpoon).toEqual([]);
  });

  it("resolves the champion team and its knockout owner", () => {
    const r = results(
      [score("u2", 30), score("u1", 20), score("u3", 10)],
      "u1",
      [{ team_id: "t1", is_champion: true }],
      [{ team_id: "t1", user_id: "u1" }],
    );
    expect(r.championTeam).toEqual({
      name: "Argentina",
      flagUrl: "ar.png",
      ownerName: "Ada",
      ownerIsSelf: true,
    });
  });

  it("reports an unowned (dropped) champion team with a null owner", () => {
    const r = results(
      [score("u1", 10)],
      "u1",
      [{ team_id: "t2", is_champion: true }],
      [], // nobody owns France in the knockout phase
    );
    expect(r.championTeam).toMatchObject({ name: "France", ownerName: null, ownerIsSelf: false });
  });

  it("is null for the champion team before the final is decided", () => {
    const r = results([score("u1", 10)], "u1", [{ team_id: "t1", is_champion: false }]);
    expect(r.championTeam).toBeNull();
  });

  it("credits bonus winners: team-pick by id, free text normalized", () => {
    const categories = [
      { id: "c1", key: "tournament_winner", name: "Tournament Winner", resolved_answer: "t1" },
      { id: "c2", key: "golden_boot", name: "Golden Boot", resolved_answer: "  Lionel  Messi " },
      { id: "c3", key: "runner_up", name: "Runner-Up", resolved_answer: null }, // unresolved → skipped
    ];
    const predictions = [
      { user_id: "u1", category_id: "c1", pick_value: "t1" }, // right
      { user_id: "u2", category_id: "c1", pick_value: "t2" }, // wrong
      { user_id: "u3", category_id: "c2", pick_value: "lionel messi" }, // right (normalized)
      { user_id: "u1", category_id: "c2", pick_value: "Mbappe" }, // wrong
    ];
    const r = results(
      [score("u1", 10), score("u2", 5), score("u3", 5)],
      "u1",
      [],
      [],
      categories,
      predictions,
    );
    expect(r.bonusHighlights).toEqual([
      { categoryName: "Tournament Winner", answer: "Argentina", winners: ["Ada"] },
      { categoryName: "Golden Boot", answer: "Lionel  Messi", winners: ["Cy"] },
    ]);
  });

  it("credits last-name and typo variants of a free-text player pick", () => {
    const categories = [
      { id: "c2", key: "golden_boot", name: "Golden Boot", resolved_answer: "Harry Kane" },
    ];
    const predictions = [
      { user_id: "u1", category_id: "c2", pick_value: "Kane" }, // surname only → hit
      { user_id: "u2", category_id: "c2", pick_value: "Harry Kane" }, // exact → hit
      { user_id: "u3", category_id: "c2", pick_value: "Mbappe" }, // wrong → miss
    ];
    const r = results(
      [score("u1", 10), score("u2", 5), score("u3", 5)],
      "u1",
      [],
      [],
      categories,
      predictions,
    );
    expect(r.bonusHighlights).toEqual([
      { categoryName: "Golden Boot", answer: "Harry Kane", winners: ["Ada", "Bob"] },
    ]);
  });

  it("returns an empty winners list for a resolved category nobody called", () => {
    const categories = [
      { id: "c1", key: "tournament_winner", name: "Tournament Winner", resolved_answer: "t3" },
    ];
    const predictions = [{ user_id: "u1", category_id: "c1", pick_value: "t1" }];
    const r = results([score("u1", 10)], "u1", [], [], categories, predictions);
    expect(r.bonusHighlights).toEqual([
      { categoryName: "Tournament Winner", answer: "Brazil", winners: [] },
    ]);
  });
});
