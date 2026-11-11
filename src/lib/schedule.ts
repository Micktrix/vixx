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

// En gemt lektion: start og samlet længde inkl. pauser (span_minutes fra databasen).
export function storedSpan(start: string, spanMinutes: number): Span {
  const from = toMinutes(start);
  return { from, to: from + spanMinutes };
}

// Skolens lektionsplan: faste starttider ("08:00", "08:45" …), og hver lektion varer `minutes`.
export type LessonPlan = { starts: string[]; minutes: number };

export const DEFAULT_PLAN: LessonPlan = {
  starts: ["08:00", "08:45", "10:00", "10:45", "12:00", "12:45", "13:45", "14:30"],
  minutes: 45,
};

// Planen fra skolens række (lesson_starts kommer som "08:00:00").
export const toPlan = (starts: string[] | null | undefined, minutes: number): LessonPlan => ({
  starts: starts?.length ? starts.map((t) => t.slice(0, 5)) : DEFAULT_PLAN.starts,
  minutes,
});

// Antal lektioner fra en starttid efter planen: næste lektion starter på planens næste tid (med
// pause imellem). Uden for planen fortsætter lektionerne i forlængelse. Samme regel som
// private.lesson_span i databasen.
export function planSpan(plan: LessonPlan, start: string, count: number): Span {
  const from = toMinutes(start);
  const i = plan.starts.indexOf(start);
  let end = from;
  for (let k = 0; k < count; k++) {
    const slot = i >= 0 && i + k < plan.starts.length ? toMinutes(plan.starts[i + k]) : null;
    end = (slot !== null && slot >= end ? slot : end) + plan.minutes;
  }
  return { from, to: end };
}

// Planen som sammenhængende blokke (lektioner i træk), fx 08:00–09:30, 10:00–11:30 …
export function planBlocks(plan: LessonPlan): Span[] {
  const blocks: Span[] = [];
  for (const t of plan.starts) {
    const from = toMinutes(t);
    const last = blocks[blocks.length - 1];
    if (last && last.to === from) last.to = from + plan.minutes;
    else blocks.push({ from, to: from + plan.minutes });
  }
  return blocks;
}

// Starttider skrevet af brugeren ("8:00, 08:45 10.00") → sorteret liste, eller null ved fejl.
export function parsePlanStarts(input: string): string[] | null {
  const parts = input.split(/[\s,;]+/).filter(Boolean);
  const times = parts.map((p) => {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(p);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  });
  if (!times.length || times.some((t) => t === null)) return null;
  return [...new Set(times as string[])].sort();
}

// Planens starttider, hvor `count` lektioner kan ligge uden at ramme noget optaget.
export function planSlotIsFree(plan: LessonPlan, start: string, count: number, busy: Span[]): boolean {
  const span = planSpan(plan, start, count);
  return span.to <= 24 * 60 && !busy.some((b) => overlaps(b, span));
}

// Første ledige starttid i planen.
export function suggestPlanStart(plan: LessonPlan, count: number, busy: Span[]): string | null {
  return plan.starts.find((t) => planSlotIsFree(plan, t, count, busy)) ?? null;
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

// Starttider hvert kvarter fra 05:00 til 22:00 (fravær, bookinger, "Kan arbejde"). Lektioner bruger skolens lektionsplan.
export const TIME_SLOTS: string[] = Array.from({ length: (22 - 5) * 4 + 1 }, (_, i) => fromMinutes(5 * 60 + i * 15));

export type DayInfo = {
  lessons: Span[];
  absences: Span[];
  bookings: Span[]; // lærerens egne bookinger af bil/lokale (ikke en lektions booking)
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
  const booking = day.bookings.find((b) => overlaps(b, span));
  if (booking) return { ok: false, why: `Booket ${formatSpan(booking)}` };
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
