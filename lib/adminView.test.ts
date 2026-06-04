import { describe, it, expect } from "vitest";
import { phaseSteps } from "./adminView";

describe("phaseSteps", () => {
  it("marks the first phase current at registration, the rest upcoming", () => {
    const steps = phaseSteps("registration");
    expect(steps.map((s) => s.status)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(steps[0].label).toBe("Registration");
  });

  it("marks earlier phases done and the rest upcoming at a middle phase", () => {
    const steps = phaseSteps("group_locked");
    expect(steps.map((s) => s.status)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks every prior phase done with the last current at complete", () => {
    const steps = phaseSteps("complete");
    expect(steps.map((s) => s.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  it("returns six steps keyed by phase name", () => {
    const steps = phaseSteps("draft");
    expect(steps.map((s) => s.key)).toEqual([
      "registration",
      "draft",
      "group_locked",
      "knockout_realloc",
      "knockout_locked",
      "complete",
    ]);
  });
});
