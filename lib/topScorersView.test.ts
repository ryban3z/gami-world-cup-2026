import { describe, it, expect } from "vitest";
import { buildTopScorers } from "@/lib/topScorersView";
import type { MappedScorer } from "@/lib/footballData";

function scorer(over: Partial<MappedScorer> = {}): MappedScorer {
  return {
    playerName: "Player",
    teamExternalId: null,
    teamName: null,
    goals: 0,
    assists: null,
    penalties: null,
    playedMatches: null,
    ...over,
  };
}

const teams = [
  { external_id: "759", flag_url: "ar.png" },
  { external_id: "760", flag_url: null },
  { external_id: null, flag_url: "noise.png" },
];

describe("buildTopScorers", () => {
  it("sorts by goals desc and assigns standard competition ranks (ties shared)", () => {
    const rows = buildTopScorers(
      [
        scorer({ playerName: "Low", goals: 2 }),
        scorer({ playerName: "Top", goals: 6 }),
        scorer({ playerName: "TieB", goals: 4 }),
        scorer({ playerName: "TieA", goals: 4 }),
      ],
      teams,
    );
    expect(rows.map((r) => [r.rank, r.playerName, r.goals])).toEqual([
      [1, "Top", 6],
      [2, "TieA", 4], // alphabetical tie-break within equal goals
      [2, "TieB", 4],
      [4, "Low", 2], // rank skips after the shared 2nd
    ]);
  });

  it("breaks equal goals by assists before name", () => {
    const rows = buildTopScorers(
      [
        scorer({ playerName: "Zed", goals: 3, assists: 5 }),
        scorer({ playerName: "Abe", goals: 3, assists: 1 }),
      ],
      teams,
    );
    expect(rows.map((r) => r.playerName)).toEqual(["Zed", "Abe"]);
  });

  it("resolves flags via team external_id, null when unmapped", () => {
    const rows = buildTopScorers(
      [
        scorer({ playerName: "A", goals: 3, teamExternalId: "759" }),
        scorer({ playerName: "B", goals: 2, teamExternalId: "760" }),
        scorer({ playerName: "C", goals: 1, teamExternalId: "999" }),
        scorer({ playerName: "D", goals: 1, teamExternalId: null }),
      ],
      teams,
    );
    expect(rows.map((r) => r.flagUrl)).toEqual(["ar.png", null, null, null]);
  });

  it("honours the limit", () => {
    const rows = buildTopScorers(
      Array.from({ length: 15 }, (_, i) => scorer({ playerName: `P${i}`, goals: 15 - i })),
      teams,
      10,
    );
    expect(rows).toHaveLength(10);
    expect(rows[0].goals).toBe(15);
  });

  it("passes through null assists/penalties without coercing to 0 in output", () => {
    const rows = buildTopScorers([scorer({ playerName: "A", goals: 4 })], teams);
    expect(rows[0].assists).toBeNull();
    expect(rows[0].penalties).toBeNull();
  });
});
