import { describe, it, expect } from "vitest";
import { emailForDisplayName } from "@/lib/identity";

describe("emailForDisplayName", () => {
  it("slugs a simple name", () => {
    expect(emailForDisplayName("Ryan")).toBe("ryan@gami-pool.com");
  });
  it("is case-insensitive", () => {
    expect(emailForDisplayName("RYAN")).toBe("ryan@gami-pool.com");
  });
  it("collapses spaces and punctuation to single hyphens", () => {
    expect(emailForDisplayName("Ryan P")).toBe("ryan-p@gami-pool.com");
    expect(emailForDisplayName("  Dave!!  ")).toBe("dave@gami-pool.com");
  });
  it("is deterministic so login can reconstruct the same address", () => {
    expect(emailForDisplayName("Big Dave 99")).toBe(
      emailForDisplayName("big dave 99"),
    );
  });
  it("falls back to 'player' when nothing slug-able remains", () => {
    expect(emailForDisplayName("!!!")).toBe("player@gami-pool.com");
  });
});
