import { describe, expect, it } from "vitest";
import { availability, formatDuration, fromMinutes, lessonSpan, slotIsFree, suggestStart, toMinutes, type DayInfo } from "./schedule";

const empty: DayInfo = { lessons: [], absences: [], holiday: null, onRequest: false, canWork: [] };

describe("tid", () => {
  it("regner frem og tilbage", () => {
    expect(toMinutes("08:15")).toBe(495);
    expect(fromMinutes(495)).toBe("08:15");
  });
  it("varighed", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 t 30 min");
    expect(formatDuration(120)).toBe("2 t");
  });
  it("3 lektioner à 45 min fra 08:00 slutter 10:15", () => {
    expect(fromMinutes(lessonSpan("08:00", 3, 45).to)).toBe("10:15");
  });
});

describe("ledige tider", () => {
  const busy = [lessonSpan("08:00", 3, 45)];
  it("en tid lige efter er ledig, en der overlapper er ikke", () => {
    expect(slotIsFree("10:15", 90, busy)).toBe(true);
    expect(slotIsFree("07:30", 45, busy)).toBe(false);
    expect(slotIsFree("07:15", 45, busy)).toBe(true);
  });
  it("foreslår første ledige tid fra 08:00", () => {
    expect(suggestStart(45, [])).toBe("08:00");
    expect(suggestStart(90, busy)).toBe("10:15");
  });
});

describe("availability", () => {
  const span = lessonSpan("09:00", 2, 45);
  it("fast lærer uden noget er ledig", () => {
    expect(availability(empty, span)).toEqual({ ok: true, why: "", warn: undefined });
  });
  it("godkendt ferie, fravær og lektion gør optaget", () => {
    expect(availability({ ...empty, holiday: "approved" }, span).why).toBe("Ferie");
    expect(availability({ ...empty, absences: [{ from: 480, to: 960 }] }, span).why).toBe("Fravær 08:00–16:00");
    expect(availability({ ...empty, lessons: [lessonSpan("10:00", 1, 45)] }, span).why).toBe("Lektion 10:00–10:45");
  });
  it("søgt ferie er en advarsel, ikke en blokering", () => {
    expect(availability({ ...empty, holiday: "pending" }, span)).toMatchObject({ ok: true, warn: "Har søgt ferie" });
  });
  it("efter aftale: kun ledig i de meldte tider", () => {
    const day = { ...empty, onRequest: true, canWork: [{ from: 480, to: 840 }] };
    expect(availability(day, span)).toMatchObject({ ok: true, why: "Kan arbejde 08:00–14:00" });
    expect(availability(day, lessonSpan("13:30", 2, 45)).ok).toBe(false);
    expect(availability({ ...day, canWork: [] }, span).why).toContain("Har ikke meldt");
  });
});
