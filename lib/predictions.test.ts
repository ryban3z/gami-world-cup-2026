import { describe, it, expect } from "vitest";
import { validateCategoryPicks } from "@/lib/predictions";

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
