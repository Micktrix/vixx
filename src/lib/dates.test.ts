import { describe, expect, it } from "vitest";
import { formatDate, formatLongDate, parseDateInput, todayDk } from "./dates";

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
