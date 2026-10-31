import { describe, expect, it } from "vitest";
import { addMonths, formatDate, formatLongDate, parseDateInput, todayDk, weekNumber, weekStart } from "./dates";

describe("kalenderhjælpere", () => {
  it("ugen starter mandag", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // søndag → mandagen før
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });
  it("ugenummer", () => {
    expect(weekNumber("2026-11-02")).toBe(45);
    expect(weekNumber("2026-01-01")).toBe(1);
    expect(weekNumber("2027-01-01")).toBe(53);
  });
  it("næste måned starter den 1.", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
  });
});

describe("todayDk", () => {
  it("bruger dansk tid omkring midnat", () => {
    // 23:30 UTC den 31. oktober er 00:30 dansk tid den 1. november (vintertid).
    expect(todayDk(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });
});

describe("formatering", () => {
  it("kort dato", () => {
    expect(formatDate("2026-11-20")).toBe("20. nov. 2026");
  });
  it("lang dato med stort begyndelsesbogstav", () => {
    expect(formatLongDate("2026-10-29")).toBe("Torsdag 29. oktober");
  });
});

describe("parseDateInput", () => {
  it("godtager en gyldig dato", () => {
    expect(parseDateInput("2026-02-28")).toBe("2026-02-28");
  });
  it.each(["", "2026-02-30", "29-10-2026", "i morgen"])("afviser %s", (v) => {
    expect(parseDateInput(v)).toBeNull();
  });
});
