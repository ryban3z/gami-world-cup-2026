import { describe, it, expect } from "vitest";
import { getBranding } from "@/lib/config";

describe("getBranding", () => {
  it("reads pool and trophy names from env", () => {
    const b = getBranding({
      NEXT_PUBLIC_POOL_NAME: "Gami All-Stars",
      NEXT_PUBLIC_TROPHY_NAME: "The Golden Drumstick",
    });
    expect(b.poolName).toBe("Gami All-Stars");
    expect(b.trophyName).toBe("The Golden Drumstick");
  });

  it("falls back to sensible defaults when env is missing", () => {
    const b = getBranding({});
    expect(b.poolName).toBe("World Cup Pool");
    expect(b.trophyName).toBe("The Trophy");
  });
});
