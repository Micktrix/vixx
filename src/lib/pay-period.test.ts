import { describe, expect, it } from "vitest";
import { daysIn, nextPeriod, periodFor, previousPeriod } from "./pay-period";

describe("lønperiode 21.–20.", () => {
  it("efter den 21. er perioden denne måned til næste", () => {
    expect(periodFor("2026-10-31", 21)).toEqual({ start: "2026-10-21", end: "2026-11-20" });
  });
  it("før den 21. er perioden sidste måned til denne", () => {
    expect(periodFor("2026-10-05", 21)).toEqual({ start: "2026-09-21", end: "2026-10-20" });
  });
  it("den 21. og den 20. hører til hver sin periode", () => {
    expect(periodFor("2026-10-21", 21).start).toBe("2026-10-21");
    expect(periodFor("2026-10-20", 21).end).toBe("2026-10-20");
  });
  it("over årsskiftet", () => {
    expect(periodFor("2027-01-10", 21)).toEqual({ start: "2026-12-21", end: "2027-01-20" });
  });
  it("frem og tilbage", () => {
    const p = periodFor("2026-10-31", 21);
    expect(nextPeriod(p, 21)).toEqual({ start: "2026-11-21", end: "2026-12-20" });
    expect(previousPeriod(p, 21)).toEqual({ start: "2026-09-21", end: "2026-10-20" });
  });
  it("startdag den 1. giver kalendermåneder", () => {
    expect(periodFor("2026-02-14", 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("alle dage i perioden", () => {
    expect(daysIn({ start: "2026-10-21", end: "2026-11-20" })).toHaveLength(31);
  });
});
