import { describe, it, expect } from "vitest";
import {
  validateCategoryPicks,
  requiredPickCount,
  bonusPicksComplete,
} from "@/lib/predictions";

describe("validateCategoryPicks", () => {
  it("accepts two different picks", () => {
    expect(validateCategoryPicks("Messi", "Mbappe")).toEqual({ ok: true });
  });
  it("accepts when one or both are blank (partial entry allowed)", () => {
    expect(validateCategoryPicks("Messi", "")).toEqual({ ok: true });
    expect(validateCategoryPicks("", "")).toEqual({ ok: true });
    expect(validateCategoryPicks("   ", "Messi")).toEqual({ ok: true });
  });
  it("rejects two identical picks (case- and whitespace-insensitive)", () => {
    expect(validateCategoryPicks("Messi", "messi").ok).toBe(false);
    expect(validateCategoryPicks("  Messi ", "Messi").ok).toBe(false);
  });
  it("returns a human-readable error message on duplicates", () => {
    const r = validateCategoryPicks("Pele", "pele");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/different/i);
  });
});

describe("requiredPickCount", () => {
  it("requires one pick for single-team award categories", () => {
    expect(requiredPickCount("tournament_winner")).toBe(1);
    expect(requiredPickCount("runner_up")).toBe(1);
    expect(requiredPickCount("wooden_spoon")).toBe(1);
  });
  it("requires two picks for player-award categories", () => {
    expect(requiredPickCount("golden_boot")).toBe(2);
    expect(requiredPickCount("young_player")).toBe(2);
  });
});

describe("bonusPicksComplete", () => {
  const cats = [
    { id: "p1", key: "golden_boot" }, // needs 2
    { id: "t1", key: "tournament_winner" }, // needs 1
  ];

  it("is false when there are no categories", () => {
    expect(bonusPicksComplete([], [])).toBe(false);
  });
  it("is false when a two-pick category has only one pick", () => {
    const picks = [
      { category_id: "p1", pick_value: "Mbappe" },
      { category_id: "t1", pick_value: "Spain" },
    ];
    expect(bonusPicksComplete(cats, picks)).toBe(false);
  });
  it("is false when the single-pick category is missing", () => {
    const picks = [
      { category_id: "p1", pick_value: "Mbappe" },
      { category_id: "p1", pick_value: "Kane" },
    ];
    expect(bonusPicksComplete(cats, picks)).toBe(false);
  });
  it("is true when every category has its required picks filled", () => {
    const picks = [
      { category_id: "p1", pick_value: "Mbappe" },
      { category_id: "p1", pick_value: "Kane" },
      { category_id: "t1", pick_value: "Spain" },
    ];
    expect(bonusPicksComplete(cats, picks)).toBe(true);
  });
  it("ignores blank/whitespace picks", () => {
    const picks = [
      { category_id: "p1", pick_value: "Mbappe" },
      { category_id: "p1", pick_value: "   " },
      { category_id: "t1", pick_value: "Spain" },
    ];
    expect(bonusPicksComplete(cats, picks)).toBe(false);
  });
});
