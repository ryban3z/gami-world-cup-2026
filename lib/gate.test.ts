import { describe, it, expect } from "vitest";
import { checkSitePassword, GATE_COOKIE } from "@/lib/gate";

describe("checkSitePassword", () => {
  it("accepts the exact password", () => {
    expect(checkSitePassword("hunter2", "hunter2")).toBe(true);
  });
  it("rejects a wrong password", () => {
    expect(checkSitePassword("nope", "hunter2")).toBe(false);
  });
  it("rejects when no password is configured", () => {
    expect(checkSitePassword("anything", undefined)).toBe(false);
    expect(checkSitePassword("anything", "")).toBe(false);
  });
  it("is length-safe (different lengths return false, no throw)", () => {
    expect(checkSitePassword("short", "muchlongerpassword")).toBe(false);
  });
  it("exposes a stable cookie name", () => {
    expect(GATE_COOKIE).toBe("gami_gate");
  });
});
