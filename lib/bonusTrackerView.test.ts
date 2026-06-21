import { describe, it, expect } from "vitest";
import { buildGoldenBootTracker } from "@/lib/bonusTrackerView";
import type { TopScorerRow } from "@/lib/topScorersView";

function row(over: Partial<TopScorerRow> = {}): TopScorerRow {
  return { rank: 1, playerName: "Player", teamName: null, flagUrl: null, goals: 5, assists: null, penalties: null, ...over };
}

const scorers: TopScorerRow[] = [
  row({ rank: 1, playerName: "Kylian Mbappé", goals: 6 }),
  row({ rank: 2, playerName: "Erling Haaland", goals: 4 }),
  row({ rank: 2, playerName: "Harry Kane", goals: 4 }),
];

const nameById = { u1: "Ade", u2: "Bex", u3: "Cy" };

describe("buildGoldenBootTracker", () => {
  it("flags the board leader as leading with live goals + rank", () => {
    const out = buildGoldenBootTracker(scorers, [{ user_id: "u1", pick_value: "Mbappe", pick_slot: 1 }], nameById);
    expect(out[0]).toEqual({ managerName: "Ade", playerName: "Mbappe", status: "leading", goals: 6, rank: 1 });
  });

  it("matches across diacritics and partial names", () => {
    const out = buildGoldenBootTracker(scorers, [{ user_id: "u2", pick_value: "Haaland", pick_slot: 1 }], nameById);
    expect(out[0].status).toBe("contention");
    expect(out[0].goals).toBe(4);
    expect(out[0].rank).toBe(2);
  });

  it("marks a pick that's not on the board as off with null goals/rank", () => {
    const out = buildGoldenBootTracker(scorers, [{ user_id: "u3", pick_value: "Lionel Messi", pick_slot: 1 }], nameById);
    expect(out[0]).toEqual({ managerName: "Cy", playerName: "Lionel Messi", status: "off", goals: null, rank: null });
  });

  it("sorts leading first, then by rank, then manager name", () => {
    const out = buildGoldenBootTracker(
      scorers,
      [
        { user_id: "u3", pick_value: "Nobody", pick_slot: 1 }, // off
        { user_id: "u2", pick_value: "Kane", pick_slot: 1 }, // contention rank 2
        { user_id: "u1", pick_value: "Mbappé", pick_slot: 1 }, // leading
      ],
      nameById,
    );
    expect(out.map((r) => r.status)).toEqual(["leading", "contention", "off"]);
    expect(out.map((r) => r.managerName)).toEqual(["Ade", "Bex", "Cy"]);
  });

  it("falls back to 'player' for an unknown user id", () => {
    const out = buildGoldenBootTracker(scorers, [{ user_id: "ghost", pick_value: "Kane", pick_slot: 1 }], nameById);
    expect(out[0].managerName).toBe("player");
  });

  it("returns nothing when there are no picks", () => {
    expect(buildGoldenBootTracker(scorers, [], nameById)).toEqual([]);
  });
});
