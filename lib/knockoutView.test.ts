import { describe, it, expect } from "vitest";
import { reallocPickOrder, freeAgentsByGroup, type TeamLite } from "@/lib/knockoutView";

describe("reallocPickOrder", () => {
  const draftOrder = ["u1", "u2", "u3", "u4"]; // u1 drafted first (slot 0)

  it("orders worst-placed (fewest points) first", () => {
    const rows = [
      { user_id: "u1", total_points: 30 },
      { user_id: "u2", total_points: 10 },
      { user_id: "u3", total_points: 20 },
      { user_id: "u4", total_points: 5 },
    ];
    expect(reallocPickOrder(rows, draftOrder)).toEqual(["u4", "u2", "u3", "u1"]);
  });

  it("breaks point ties by reverse draft order (later slot picks first)", () => {
    const rows = [
      { user_id: "u1", total_points: 10 },
      { user_id: "u2", total_points: 10 },
      { user_id: "u3", total_points: 10 },
    ];
    // All level — u3 (latest of the three slots) picks first, u1 last.
    expect(reallocPickOrder(rows, draftOrder)).toEqual(["u3", "u2", "u1"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      { user_id: "u1", total_points: 2 },
      { user_id: "u2", total_points: 1 },
    ];
    const copy = [...rows];
    reallocPickOrder(rows, draftOrder);
    expect(rows).toEqual(copy);
  });
});

describe("freeAgentsByGroup", () => {
  const T = (id: string, group_letter: string | null): TeamLite => ({
    id, name: id, flag_url: null, group_letter,
  });

  it("buckets teams by group letter, sorted A→L", () => {
    const grouped = freeAgentsByGroup([T("b1", "B"), T("a1", "A"), T("b2", "B")]);
    expect(grouped.map((g) => g.letter)).toEqual(["A", "B"]);
    expect(grouped[1].teams.map((t) => t.id)).toEqual(["b1", "b2"]);
  });

  it("files teams with no group letter under '?'", () => {
    const grouped = freeAgentsByGroup([T("x", null)]);
    expect(grouped).toEqual([{ letter: "?", teams: [T("x", null)] }]);
  });
});
