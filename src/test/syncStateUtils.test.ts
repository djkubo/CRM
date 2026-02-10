import { describe, it, expect } from "vitest";
import { getFreshnessBucket, getRecommendedRangeAction } from "@/lib/syncStateUtils";

describe("syncStateUtils", () => {
  it("buckets freshness correctly", () => {
    const now = new Date("2026-02-10T00:00:00.000Z");

    expect(getFreshnessBucket(null, now)).toBe("red");
    expect(getFreshnessBucket("not-a-date", now)).toBe("red");

    expect(getFreshnessBucket("2026-02-09T23:00:00.000Z", now)).toBe("green"); // 1h
    expect(getFreshnessBucket("2026-02-08T00:00:00.000Z", now)).toBe("yellow"); // 2d
    expect(getFreshnessBucket("2026-01-30T00:00:00.000Z", now)).toBe("red"); // 11d
  });

  it("recommends actions by bucket", () => {
    expect(getRecommendedRangeAction("green")).toEqual({ mode: null, label: "No hace falta" });
    expect(getRecommendedRangeAction("yellow")).toEqual({ mode: "last24h", label: "Correr 24h" });
    expect(getRecommendedRangeAction("red")).toEqual({ mode: "last7d", label: "Correr 7d" });
  });
});

