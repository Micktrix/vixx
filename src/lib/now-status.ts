import type { DayInfo, Span } from "./schedule";

// Status "lige nu" til storskærmen. Tider er minutter efter midnat i dansk tid.

export function nowMinutesDk(now: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" })
    .format(now)
    .split(/[.:]/)
    .map(Number);
  return h * 60 + m;
}

// Slutningen af den sammenhængende blok, der dækker `now` (lektioner i træk tæller som én).
function blockEnd(spans: Span[], now: number): number | null {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  let end: number | null = null;
  for (const s of sorted) {
    if (end === null ? s.from <= now && now < s.to : s.from <= end) end = Math.max(end ?? 0, s.to);
  }
  return end;
}

const nextStart = (spans: Span[], now: number) =>
  spans.filter((s) => s.from > now).reduce<number | null>((min, s) => (min === null || s.from < min ? s.from : min), null);

export type TeacherNow =
  | { state: "busy"; until: number }
  | { state: "free"; until: number | null } // null = resten af dagen
  | { state: "away"; reason: string; until: number | null }
  | { state: "off" }; // "Efter aftale" uden meldt tid nu

export function teacherNow(day: DayInfo, now: number): TeacherNow {
  if (day.holiday === "approved") return { state: "away", reason: "Ferie", until: null };
  const absence = day.absences.find((a) => a.from <= now && now < a.to);
  if (absence) return { state: "away", reason: "Fravær", until: blockEnd(day.absences, now) };
  if (day.lessons.some((l) => l.from <= now && now < l.to)) return { state: "busy", until: blockEnd(day.lessons, now)! };

  const nextBusy = nextStart([...day.lessons, ...day.absences], now);
  if (day.onRequest) {
    const cover = day.canWork.find((c) => c.from <= now && now < c.to);
    if (!cover) return { state: "off" };
    return { state: "free", until: nextBusy !== null && nextBusy < cover.to ? nextBusy : cover.to };
  }
  return { state: "free", until: nextBusy };
}

export type ResourceNow = { state: "busy"; until: number } | { state: "free"; until: number | null };

export function resourceNow(bookings: Span[], now: number): ResourceNow {
  if (bookings.some((b) => b.from <= now && now < b.to)) return { state: "busy", until: blockEnd(bookings, now)! };
  return { state: "free", until: nextStart(bookings, now) };
}
