import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "./ical";

const now = new Date("2026-11-11T12:00:00Z");

describe("kalenderfil til telefonen", () => {
  it("har en lektion med dansk tid, sted og ingen elevnavne", () => {
    const ics = buildCalendar(
      "Vixx – Lars",
      [{ uid: "lesson-1", date: "2026-11-12", from: 480, to: 570, summary: "B privat", location: "BMW 2", description: "2 lektioner" }],
      now,
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("X-WR-CALNAME:Vixx – Lars");
    expect(ics).toContain("DTSTART;TZID=Europe/Copenhagen:20261112T080000");
    expect(ics).toContain("DTEND;TZID=Europe/Copenhagen:20261112T093000");
    expect(ics).toContain("SUMMARY:B privat");
    expect(ics).toContain("LOCATION:BMW 2");
    expect(ics).toContain("UID:lesson-1@vixx.dk");
    expect(ics).toContain("DTSTAMP:20261111T120000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("ferie er en heldagsbegivenhed", () => {
    const ics = buildCalendar("Vixx", [{ uid: "h-1", date: "2026-12-21", endDate: "2026-12-24", allDay: true, summary: "Ferie" }], now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261221");
    expect(ics).toContain("DTEND;VALUE=DATE:20261224");
  });
  it("escaper komma, semikolon og linjeskift", () => {
    expect(escapeText("Møde; teori, lokale\nny linje")).toBe("Møde\\; teori\\, lokale\\nny linje");
  });
  it("folder lange linjer efter 75 bytes", () => {
    const folded = foldLine("SUMMARY:" + "æ".repeat(60));
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replaceAll("\r\n ", "")).toBe("SUMMARY:" + "æ".repeat(60));
  });
});
