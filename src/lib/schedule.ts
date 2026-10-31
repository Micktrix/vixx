// Tid og ledighed. Samme regler som i databasen (private.instructor_conflict); databasen har sidste ord.

export type Span = { from: number; to: number }; // minutter efter midnat, [from, to)

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const overlaps = (a: Span, b: Span) => a.from < b.to && b.from < a.to;

export function lessonSpan(start: string, count: number, lessonMinutes: number): Span {
  const from = toMinutes(start);
  return { from, to: from + count * lessonMinutes };
}

export function absenceSpan(start: string, hours: number): Span {
  const from = toMinutes(start);
  return { from, to: from + Math.round(hours * 60) };
}

export const formatSpan = (s: Span) => `${fromMinutes(s.from)}–${fromMinutes(s.to)}`;

// "45 min", "1 t 30 min", "2 t"
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} t` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

// Starttider hvert kvarter fra 05:00 til 22:00, som i prototypen. Arbejdsdagen starter 08:00.
export const DAY_START = 8 * 60;
export const TIME_SLOTS: string[] = Array.from({ length: (22 - 5) * 4 + 1 }, (_, i) => fromMinutes(5 * 60 + i * 15));

// Kan en lektion af `duration` minutter starte på tidspunktet uden at ramme noget optaget?
export function slotIsFree(start: string, duration: number, busy: Span[]): boolean {
  const span = { from: toMinutes(start), to: toMinutes(start) + duration };
  return span.to <= 24 * 60 && !busy.some((b) => overlaps(b, span));
}

// Første ledige tid fra 08:00, ellers første ledige overhovedet.
export function suggestStart(duration: number, busy: Span[]): string | null {
  const free = TIME_SLOTS.filter((t) => slotIsFree(t, duration, busy));
  return free.find((t) => toMinutes(t) >= DAY_START) ?? free[0] ?? null;
}

export type DayInfo = {
  lessons: Span[];
  absences: Span[];
  holiday: "approved" | "pending" | null;
  onRequest: boolean; // "Efter aftale"
  canWork: Span[]; // "Kan arbejde" (kun for "Efter aftale")
};

export type Availability = { ok: boolean; why: string; warn?: string };

const CAN_WORK_MISSING = "Har ikke meldt “Kan arbejde”";

// Er læreren ledig i tidsrummet? Bruges af "Find ledig underviser" og planlægningens advarsler.
export function availability(day: DayInfo, span: Span): Availability {
  if (day.holiday === "approved") return { ok: false, why: "Ferie" };
  const absence = day.absences.find((a) => overlaps(a, span));
  if (absence) return { ok: false, why: `Fravær ${formatSpan(absence)}` };
  const lesson = day.lessons.find((l) => overlaps(l, span));
  if (lesson) return { ok: false, why: `Lektion ${formatSpan(lesson)}` };
  const warn = day.holiday === "pending" ? "Har søgt ferie" : undefined;
  if (day.onRequest) {
    const cover = day.canWork.find((c) => c.from <= span.from && span.to <= c.to);
    if (cover) return { ok: true, why: `Kan arbejde ${formatSpan(cover)}`, warn };
    const why = day.canWork.length
      ? `Kan arbejde ${day.canWork.map(formatSpan).join(", ")} (ikke hele tidsrummet)`
      : CAN_WORK_MISSING;
    return { ok: false, why, warn };
  }
  return { ok: true, why: "", warn };
}
