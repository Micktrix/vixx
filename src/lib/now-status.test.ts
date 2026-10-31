import { describe, expect, it } from "vitest";
import { nowMinutesDk, resourceNow, teacherNow } from "./now-status";
import type { DayInfo } from "./schedule";

const empty: DayInfo = { lessons: [], absences: [], holiday: null, onRequest: false, canWork: [] };
const t = (h: number, m = 0) => h * 60 + m;

describe("lige nu: lærere", () => {
  it("i lektion: optaget til slutningen af lektionerne i træk", () => {
    const day = { ...empty, lessons: [{ from: t(8), to: t(9, 30) }, { from: t(9, 30), to: t(10, 15) }, { from: t(13), to: t(14) }] };
    expect(teacherNow(day, t(9))).toEqual({ state: "busy", until: t(10, 15) });
  });
  it("mellem lektioner: ledig til næste", () => {
    const day = { ...empty, lessons: [{ from: t(8), to: t(9) }, { from: t(13), to: t(14) }] };
    expect(teacherNow(day, t(10))).toEqual({ state: "free", until: t(13) });
  });
  it("intet mere i dag: ledig resten af dagen", () => {
    expect(teacherNow(empty, t(10))).toEqual({ state: "free", until: null });
  });
  it("ferie og fravær", () => {
    expect(teacherNow({ ...empty, holiday: "approved" }, t(10))).toEqual({ state: "away", reason: "Ferie", until: null });
    expect(teacherNow({ ...empty, absences: [{ from: t(8), to: t(16) }] }, t(10))).toEqual({ state: "away", reason: "Fravær", until: t(16) });
  });
  it("efter aftale: kun ledig i den meldte tid", () => {
    const day = { ...empty, onRequest: true, canWork: [{ from: t(9), to: t(14) }] };
    expect(teacherNow(day, t(10))).toEqual({ state: "free", until: t(14) });
    expect(teacherNow(day, t(15))).toEqual({ state: "off" });
  });
});

describe("lige nu: lokaler og køretøjer", () => {
  const bookings = [{ from: t(10), to: t(12) }, { from: t(15), to: t(16) }];
  it("booket nu", () => {
    expect(resourceNow(bookings, t(11))).toEqual({ state: "busy", until: t(12) });
  });
  it("ledig til næste booking eller resten af dagen", () => {
    expect(resourceNow(bookings, t(13))).toEqual({ state: "free", until: t(15) });
    expect(resourceNow(bookings, t(17))).toEqual({ state: "free", until: null });
  });
});

describe("dansk tid", () => {
  it("bruger dansk tid", () => {
    expect(nowMinutesDk(new Date("2026-10-31T12:30:00Z"))).toBe(t(13, 30)); // vintertid, UTC+1
  });
});
