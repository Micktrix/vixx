import "server-only";
import { todayDk } from "@/lib/dates";
import { absenceSpan, storedSpan, toMinutes, type DayInfo, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Alt hvad kontorets kalender, planlægning og "Find ledig underviser" skal bruge for en periode.

export type ScheduleInstructor = {
  id: string;
  name: string;
  onRequest: boolean;
  isGuest: boolean;
  activeUntil: string | null;
};

export type ScheduleLesson = Span & {
  id: string;
  instructorId: string;
  date: string;
  start: string;
  count: number;
  serviceName: string;
  studentName: string | null;
  note: string | null;
};

export type ScheduleAbsence = Span & {
  id: string;
  instructorId: string;
  date: string;
  reason: "sick" | "off" | "other";
  hours: number;
  note: string | null;
};

export type ScheduleHoliday = { id: string; instructorId: string; from: string; to: string; status: "pending" | "approved" | "rejected" };

export type Schedule = {
  instructors: ScheduleInstructor[];
  lessons: ScheduleLesson[];
  absences: ScheduleAbsence[];
  holidays: ScheduleHoliday[];
  canWork: (Span & { instructorId: string; date: string })[];
};

export const REASON_LABEL = { sick: "Syg", off: "Fri", other: "Andet" } as const;

type InstructorRow = {
  id: string;
  availability: "fixed" | "on_request";
  is_guest: boolean;
  active_until: string | null;
  school_members: { active: boolean; profiles: { full_name: string } | null } | null;
};

export async function loadSchedule(schoolId: string, from: string, to: string): Promise<Schedule> {
  const supabase = await createClient();
  const today = todayDk();

  const [instructors, lessons, absences, holidays, canWork] = await Promise.all([
    supabase
      .from("instructors")
      .select(
        "id, availability, is_guest, active_until, school_members!inner(active, profiles(full_name))",
      )
      .eq("school_id", schoolId)
      .eq("active", true)
      .eq("school_members.active", true),
    supabase
      .from("scheduled_lessons")
      .select("id, instructor_id, lesson_date, start_time, lesson_count, lesson_minutes, span_minutes, student_name, note, services(name)")
      .eq("school_id", schoolId)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("start_time"),
    supabase
      .from("absences")
      .select("id, instructor_id, absence_date, start_time, hours, reason, note")
      .eq("school_id", schoolId)
      .gte("absence_date", from)
      .lte("absence_date", to),
    supabase
      .from("holidays")
      .select("id, instructor_id, from_date, to_date, status")
      .eq("school_id", schoolId)
      .neq("status", "rejected")
      .lte("from_date", to)
      .gte("to_date", from),
    supabase
      .from("availability")
      .select("instructor_id, available_date, start_time, end_time")
      .eq("school_id", schoolId)
      .gte("available_date", from)
      .lte("available_date", to),
  ]);

  return {
    instructors: ((instructors.data ?? []) as unknown as InstructorRow[])
      // Gæster efter "aktiv til" vises ikke, med mindre perioden ligger før datoen.
      .filter((i) => !i.active_until || i.active_until >= from || i.active_until >= today)
      .map((i) => ({
        id: i.id,
        name: i.school_members?.profiles?.full_name ?? "",
        onRequest: i.availability === "on_request",
        isGuest: i.is_guest,
        activeUntil: i.active_until,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "da")),
    lessons: (lessons.data ?? []).map((l) => ({
      ...storedSpan(l.start_time, l.span_minutes),
      id: l.id,
      instructorId: l.instructor_id,
      date: l.lesson_date,
      start: l.start_time.slice(0, 5),
      count: l.lesson_count,
      serviceName: (l.services as unknown as { name: string } | null)?.name ?? "",
      studentName: l.student_name,
      note: l.note,
    })),
    absences: (absences.data ?? []).map((a) => ({
      ...absenceSpan(a.start_time, Number(a.hours)),
      id: a.id,
      instructorId: a.instructor_id,
      date: a.absence_date,
      reason: a.reason,
      hours: Number(a.hours),
      note: a.note,
    })),
    holidays: (holidays.data ?? []).map((h) => ({
      id: h.id,
      instructorId: h.instructor_id,
      from: h.from_date,
      to: h.to_date,
      status: h.status,
    })),
    canWork: (canWork.data ?? []).map((c) => ({
      instructorId: c.instructor_id,
      date: c.available_date,
      from: toMinutes(c.start_time),
      to: toMinutes(c.end_time),
    })),
  };
}

// Én lærers dag, som availability() i src/lib/schedule.ts forventer den.
export function dayInfo(schedule: Schedule, instructor: ScheduleInstructor, date: string, ignoreLessonId?: string): DayInfo {
  const holiday = schedule.holidays.find((h) => h.instructorId === instructor.id && h.from <= date && date <= h.to);
  return {
    lessons: schedule.lessons.filter((l) => l.instructorId === instructor.id && l.date === date && l.id !== ignoreLessonId),
    absences: schedule.absences.filter((a) => a.instructorId === instructor.id && a.date === date),
    holiday: holiday?.status === "approved" ? "approved" : holiday?.status === "pending" ? "pending" : null,
    onRequest: instructor.onRequest,
    canWork: schedule.canWork.filter((c) => c.instructorId === instructor.id && c.date === date),
  };
}
