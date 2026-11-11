import "server-only";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { absenceSpan, storedSpan, toMinutes, toPlan, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Den indloggede lærer på den aktive skole, med skolens indstillinger.
export async function getTeacher() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const [{ data: instructor }, { data: school }] = await Promise.all([
    supabase
      .from("instructors")
      .select("id, availability")
      .eq("school_id", membership.schoolId)
      .eq("user_id", user.id)
      .single(),
    supabase.from("schools").select("lesson_minutes, lesson_starts, pay_period_start_day").eq("id", membership.schoolId).single(),
  ]);
  if (!instructor || !school) notFound();
  return {
    user,
    membership,
    instructorId: instructor.id,
    onRequest: instructor.availability === "on_request",
    lessonMinutes: school.lesson_minutes,
    plan: toPlan(school.lesson_starts, school.lesson_minutes),
    periodStartDay: school.pay_period_start_day,
  };
}

export type Teacher = Awaited<ReturnType<typeof getTeacher>>;

export const STATUS_LABEL = { pending: "Afventer", approved: "Godkendt", rejected: "Afvist" } as const;
export type Status = keyof typeof STATUS_LABEL;

export type TeacherRegistration = Span & {
  id: string;
  date: string;
  start: string;
  count: number;
  serviceId: string;
  serviceName: string;
  status: Status;
  comment: string | null;
  note: string | null;
  studentName: string | null;
  scheduledLessonId: string | null;
  officeEdited: boolean;
  unitPriceOre: number | null;
};

export type TeacherLesson = Span & {
  id: string;
  date: string;
  start: string;
  count: number;
  serviceName: string;
  studentName: string | null;
  note: string | null;
  origin: "office" | "instructor";
};

// Alt for lærerens egne dage i en periode. RLS sikrer, at læreren kun ser sit eget.
export async function loadTeacherPeriod(teacher: Teacher, from: string, to: string) {
  const supabase = await createClient();
  const id = teacher.instructorId;
  const [registrations, lessons, absences, holidays, canWork, locked] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, lesson_date, start_time, lesson_count, lesson_minutes, span_minutes, service_id, status, decision_comment, note, student_name, scheduled_lesson_id, office_edited_at, unit_price_ore, services(name)",
      )
      .eq("instructor_id", id)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("start_time"),
    supabase
      .from("scheduled_lessons")
      .select("id, lesson_date, start_time, lesson_count, lesson_minutes, span_minutes, student_name, note, origin, services(name)")
      .eq("instructor_id", id)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("start_time"),
    supabase
      .from("absences")
      .select("id, absence_date, start_time, hours, reason")
      .eq("instructor_id", id)
      .gte("absence_date", from)
      .lte("absence_date", to),
    supabase
      .from("holidays")
      .select("id, from_date, to_date, status, note")
      .eq("instructor_id", id)
      .neq("status", "rejected")
      .lte("from_date", to)
      .gte("to_date", from),
    supabase
      .from("availability")
      .select("id, available_date, start_time, end_time")
      .eq("instructor_id", id)
      .gte("available_date", from)
      .lte("available_date", to)
      .order("start_time"),
    supabase
      .from("pay_periods")
      .select("starts_on, ends_on")
      .eq("school_id", teacher.membership.schoolId)
      .eq("locked", true)
      .lte("starts_on", to)
      .gte("ends_on", from),
  ]);

  const name = (s: unknown) => (s as { name: string } | null)?.name ?? "";
  return {
    registrations: (registrations.data ?? []).map(
      (r): TeacherRegistration => ({
        ...storedSpan(r.start_time, r.span_minutes),
        id: r.id,
        date: r.lesson_date,
        start: r.start_time.slice(0, 5),
        count: r.lesson_count,
        serviceId: r.service_id,
        serviceName: name(r.services),
        status: r.status,
        comment: r.decision_comment,
        note: r.note,
        studentName: r.student_name,
        scheduledLessonId: r.scheduled_lesson_id,
        officeEdited: !!r.office_edited_at,
        unitPriceOre: r.unit_price_ore,
      }),
    ),
    lessons: (lessons.data ?? []).map(
      (l): TeacherLesson => ({
        ...storedSpan(l.start_time, l.span_minutes),
        id: l.id,
        date: l.lesson_date,
        start: l.start_time.slice(0, 5),
        count: l.lesson_count,
        serviceName: name(l.services),
        studentName: l.student_name,
        note: l.note,
        origin: l.origin,
      }),
    ),
    absences: (absences.data ?? []).map((a) => ({
      ...absenceSpan(a.start_time, Number(a.hours)),
      id: a.id,
      date: a.absence_date,
      reason: a.reason as "sick" | "off" | "other",
    })),
    holidays: (holidays.data ?? []).map((h) => ({
      id: h.id,
      from: h.from_date,
      to: h.to_date,
      status: h.status as "pending" | "approved",
      note: h.note,
    })),
    canWork: (canWork.data ?? []).map((c) => ({
      id: c.id,
      date: c.available_date,
      from: toMinutes(c.start_time),
      to: toMinutes(c.end_time),
    })),
    locked: (locked.data ?? []).map((p) => ({ from: p.starts_on, to: p.ends_on })),
  };
}

export type TeacherPeriod = Awaited<ReturnType<typeof loadTeacherPeriod>>;

export const isLocked = (period: TeacherPeriod, date: string) => period.locked.some((p) => p.from <= date && date <= p.to);

// Ydelser, læreren kan vælge: alle aktive.
export async function allowedServices(teacher: Teacher) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, name")
    .eq("school_id", teacher.membership.schoolId)
    .eq("active", true)
    .order("name");
  return data ?? [];
}

export type AllowedService = Awaited<ReturnType<typeof allowedServices>>[number];
