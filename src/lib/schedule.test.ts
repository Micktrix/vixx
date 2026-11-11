import { describe, expect, it } from "vitest";
import { availability, DEFAULT_PLAN, formatDuration, fromMinutes, parsePlanStarts, planBlocks, planSlotIsFree, planSpan, storedSpan, suggestPlanStart, toMinutes, toPlan, type DayInfo } from "./schedule";

const empty: DayInfo = { lessons: [], absences: [], bookings: [], holiday: null, onRequest: false, canWork: [] };

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
  it("en gemt lektion bruger sin samlede længde", () => {
    expect(storedSpan("08:00", 435)).toEqual({ from: 480, to: 915 });
  });
});

describe("lektionsplan", () => {
  const plan = DEFAULT_PLAN; // 08:00 08:45 | 10:00 10:45 | 12:00 12:45 | 13:45 14:30
  const end = (start: string, count: number) => fromMinutes(planSpan(plan, start, count).to);
  it("8 lektioner fra 08:00 slutter 15:15 med pauserne", () => {
    expect(end("08:00", 8)).toBe("15:15");
  });
  it("følger pauserne fra en starttid midt i planen", () => {
    expect(end("08:00", 2)).toBe("09:30");
    expect(end("08:45", 2)).toBe("10:45");
    expect(end("12:45", 2)).toBe("14:30");
  });
  it("fortsætter uden pause efter planens sidste lektion", () => {
    expect(end("14:30", 3)).toBe("16:45");
  });
  it("ledige starttider tager højde for hele blokken", () => {
    const busy = [planSpan(plan, "08:00", 3)]; // 08:00–10:45
    expect(planSlotIsFree(plan, "10:45", 2, busy)).toBe(true);
    expect(planSlotIsFree(plan, "08:45", 1, busy)).toBe(false);
    expect(suggestPlanStart(plan, 2, busy)).toBe("10:45");
  });
  it("planen som blokke med pauser", () => {
    expect(planBlocks(plan).map((b) => `${fromMinutes(b.from)}–${fromMinutes(b.to)}`)).toEqual([
      "08:00–09:30",
      "10:00–11:30",
      "12:00–13:30",
      "13:45–15:15",
    ]);
  });
  it("læser starttider skrevet af brugeren", () => {
    expect(parsePlanStarts("8:00, 08:45 10.00;10:45")).toEqual(["08:00", "08:45", "10:00", "10:45"]);
    expect(parsePlanStarts("08:00, kl. 9")).toBeNull();
    expect(parsePlanStarts("")).toBeNull();
  });
  it("planen fra databasen", () => {
    expect(toPlan(["08:00:00", "08:45:00"], 45)).toEqual({ starts: ["08:00", "08:45"], minutes: 45 });
    expect(toPlan(null, 45).starts).toEqual(DEFAULT_PLAN.starts);
  });
});

describe("availability", () => {
  const span = storedSpan("09:00", 90);
  it("fast lærer uden noget er ledig", () => {
    expect(availability(empty, span)).toEqual({ ok: true, why: "", warn: undefined });
  });
  it("godkendt ferie, fravær og lektion gør optaget", () => {
    expect(availability({ ...empty, holiday: "approved" }, span).why).toBe("Ferie");
    expect(availability({ ...empty, absences: [{ from: 480, to: 960 }] }, span).why).toBe("Fravær 08:00–16:00");
    expect(availability({ ...empty, lessons: [storedSpan("10:00", 45)] }, span).why).toBe("Lektion 10:00–10:45");
  });
  it("lærerens egen booking (fx et møde) gør optaget", () => {
    expect(availability({ ...empty, bookings: [storedSpan("09:30", 60)] }, span).why).toBe("Booket 09:30–10:30");
  });
  it("søgt ferie er en advarsel, ikke en blokering", () => {
    expect(availability({ ...empty, holiday: "pending" }, span)).toMatchObject({ ok: true, warn: "Har søgt ferie" });
  });
  it("efter aftale: kun ledig i de meldte tider", () => {
    const day = { ...empty, onRequest: true, canWork: [{ from: 480, to: 840 }] };
    expect(availability(day, span)).toMatchObject({ ok: true, why: "Kan arbejde 08:00–14:00" });
    expect(availability(day, storedSpan("13:30", 90)).ok).toBe(false);
    expect(availability({ ...day, canWork: [] }, span).why).toContain("Har ikke meldt");
  });
});
