import { describe, expect, it } from "vitest";
import { zonedParts, zonedToUtc } from "@/lib/time";

describe("time zones", () => {
  it("converts Madrid wall time to UTC in summer and winter", () => {
    expect(zonedToUtc(2026, 7, 1, 18, 0, "Europe/Madrid").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 18, 0, "Europe/Madrid").toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });
  it("round-trips", () => {
    const d = zonedToUtc(2026, 3, 29, 18, 30, "America/Mexico_City");
    expect(zonedParts(d, "America/Mexico_City")).toMatchObject({ y: 2026, m: 3, d: 29, hh: 18, mm: 30 });
  });
});
