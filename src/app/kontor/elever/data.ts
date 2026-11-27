import "server-only";
import { moduleProgress, type ModuleCompletion, type ModuleCount, type PlanModule } from "@/lib/module-progress";
import { todayDk } from "@/lib/dates";
import type { Appointment } from "@/lib/appointments";
import { lessonProgress, type LessonSignoff, type SchoolLesson } from "@/lib/lesson-plan";
import { createClient } from "@/lib/supabase/server";

// Hold, elever og forløb (modulplaner) til kontorets elevsider. Et modul er gennemført, når læreren har
// afsluttet det.

export type CourseInfo = {
  id: string;
  name: string;
  category: string;
  kind: string; // B, C, CE, D, TAXA eller et EU-forløb (EU_GODS, EU_BUS, EU_GODS3, EU_BUS3)
  active: boolean;
  theoryAtScan: boolean; // "Teori registreres ved scanning"
  minDays: number | null;
  modules: PlanModule[];
  lessons: SchoolLesson[]; // skolens lektionsplan (C, D, C/E); tom = modulerne vises (trin E10)
};
export type StudentInfo = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  address: string | null; // står på modulplanen
  manualGear: boolean; // kode 78 (kun B)
  euCourseId: string | null; // elevens EU-forløb oven i kørekortforløbet (trin E9)
  courseStartOn: string | null; // kontorets rettelse af start af modul 1
  createdAt: string;
  planTemplateId: string | null; // elevens version af modulplanens PDF
  repetitions: { id: string; lesson_date: string; lesson_count: number; instructor_name: string }[];
  teamId: string | null;
  courseId: string;
  serviceId: string | null;
  active: boolean;
  finished: Finished | null; // forløbet er afsluttet (fx bestået køreprøve); eleven er inaktiv
  moduleCounts: ModuleCount[]; // lektioner talt i modulerne
  moduleCompletions: ModuleCompletion[]; // afsluttede moduler
  appointments: Appointment[]; // aftaler: KTA, mørke, teoriprøve, køreprøve (faktaboksen)
  euSignoffs: { kind: string; eu_topic_id: string | null; lessons: number | null }[]; // EU-bekræftelser (trin E9)
  lessonSignoffs: LessonSignoff[]; // kørte lektioner i lektionsplanen (trin E10)
};
// EU-forløbene vælges som "EU-forløb" på eleven, aldrig som kørekortforløb.
export const isEuKind = (kind: string | null | undefined) => !!kind && kind.startsWith("EU");

export const FINISH_LABEL = { passed: "Bestået køreprøve", stopped: "Stoppet", other: "Afsluttet" } as const;
export type Finished = { on: string; reason: keyof typeof FINISH_LABEL; note: string | null };

export type TeamInfo = { id: string; name: string; courseId: string | null; startsOn: string | null; active: boolean };

export async function loadStudents(schoolId: string) {
  const supabase = await createClient();
  const [{ data: teams }, { data: students }, { data: courses }] = await Promise.all([
    supabase.from("teams").select("id, name, course_id, starts_on, active").eq("school_id", schoolId).order("name"),
    supabase
      .from("students")
      .select(
        "id, user_id, team_id, course_id, service_id, address, manual_gear, eu_course_id, course_start_on, created_at, plan_template_id, active, finished_on, finish_reason, finish_note, profiles(full_name, phone), student_appointments(id, kind, on_date, at_time, address, status, created_at), eu_signoffs(kind, eu_topic_id, lessons), lesson_signoffs(school_lesson_id, lesson_date, instructor_name), module_signoffs(course_module_id, kind, lesson_count, dark, manual_gear, lesson_date, instructor_name, skipped_items), repetition_lessons(id, lesson_date, lesson_count, instructor_name), module_completions(id, course_module_id, module_number, completed_on, started_on, instructor_id, instructor_name, transferred, self_study, comment, theory_lessons, extra_theory, extra_driving, annulled_at, annul_reason)",
      )
      .eq("school_id", schoolId)
      .eq("is_demo", false), // admins demo-elev vises ikke i kontorets lister
    supabase
      .from("courses")
      .select("id, name, category_code, kind, active, theory_at_scan, min_days, course_modules(id, number, name, min_theory, min_driving, min_dark, topics), school_lessons(id, number, title, kind, units, items, control, note)")
      .eq("school_id", schoolId)
      .not("kind", "is", null) // kun de faste forløb
      .order("name"),
  ]);

  const courseList: CourseInfo[] = (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category_code,
    kind: c.kind as string,
    active: c.active,
    theoryAtScan: c.theory_at_scan,
    minDays: c.min_days,
    modules: (c.course_modules ?? []) as PlanModule[],
    lessons: ((c.school_lessons ?? []) as SchoolLesson[]).sort((a, b) => a.number - b.number),
  }));
  const studentList: StudentInfo[] = (students ?? [])
    .map((s) => {
      const p = s.profiles as unknown as { full_name: string; phone: string } | null;
      return {
        id: s.id,
        userId: s.user_id,
        name: p?.full_name ?? "",
        phone: p?.phone ?? "",
        address: s.address,
        manualGear: s.manual_gear,
        euCourseId: s.eu_course_id,
        courseStartOn: s.course_start_on,
        createdAt: s.created_at,
        planTemplateId: s.plan_template_id,
        repetitions: ((s.repetition_lessons ?? []) as StudentInfo["repetitions"]).sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)),
        teamId: s.team_id,
        courseId: s.course_id,
        serviceId: s.service_id,
        active: s.active,
        finished: s.finished_on ? { on: s.finished_on, reason: s.finish_reason as Finished["reason"], note: s.finish_note } : null,
        moduleCounts: (s.module_signoffs ?? []) as ModuleCount[],
        moduleCompletions: (s.module_completions ?? []) as ModuleCompletion[],
        appointments: (s.student_appointments ?? []) as Appointment[],
        euSignoffs: (s.eu_signoffs ?? []) as StudentInfo["euSignoffs"],
        lessonSignoffs: (s.lesson_signoffs ?? []) as LessonSignoff[],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
  const teamList: TeamInfo[] = (teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    courseId: t.course_id,
    startsOn: t.starts_on,
    active: t.active,
  }));
  return { teams: teamList, students: studentList, courses: courseList };
}

// Start af modul 1: elevens egen dato, ellers holdets startdato, ellers oprettelsesdatoen.
export function courseStart(student: StudentInfo, team: TeamInfo | undefined): string {
  return student.courseStartOn ?? team?.startsOn ?? todayDk(new Date(student.createdAt));
}

// Andelen (0–1) tæller også kørte lektioner (Michael 21. nov. 2026): et afsluttet modul tæller helt, et modul i gang
// med kørsel (og teori, når den scannes) i forhold til minimum, dog højst 95 %, indtil det er afsluttet.
export function progress(student: StudentInfo, course: CourseInfo | undefined) {
  const total = course?.modules.length ?? 0;
  const done = course ? student.moduleCompletions.filter((c) => !c.annulled_at && course.modules.some((m) => m.id === c.course_module_id)).length : 0;
  if (!course || !total) return { done, total, share: 0 };
  // Lektionsplanen (C, D, C/E): andelen er kørte lektioner (45-minutters-enheder) af planens i alt.
  if (course.lessons.length) return { done, total, share: lessonProgress(course.lessons, student.lessonSignoffs).share };
  const parts = moduleProgress(course.modules, student.moduleCounts, student.moduleCompletions, course.theoryAtScan).map((m) => {
    if (m.completed) return 1;
    const need = m.min_driving + (course.theoryAtScan ? m.min_theory : 0);
    const have = Math.min(m.driving, m.min_driving) + (course.theoryAtScan ? Math.min(m.theory, m.min_theory) : 0);
    return need ? Math.min(have / need, 0.95) : 0;
  });
  return { done, total, share: parts.reduce((n, x) => n + x, 0) / total };
}

// Til holdtavlen pr. EU-forløb: emnernes faste timer (emne → timer) og køretimerne i alt (á 45 min.).
export type EuTotals = { name: string; kind: string; hours: Map<string, number>; drives: number; driveList: { id: string; title: string; sort: number; lessons: number }[] };
export async function loadEuHours(schoolId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("eu_topics").select("id, course_id, kind, sort, code, hours, lessons, courses(name, kind)").eq("school_id", schoolId);
  const out = new Map<string, EuTotals>();
  for (const t of data ?? []) {
    if (!out.has(t.course_id)) {
      const c = t.courses as unknown as { name: string; kind: string } | null;
      out.set(t.course_id, { name: c?.name ?? "EU", kind: c?.kind ?? "", hours: new Map(), drives: 0, driveList: [] });
    }
    const c = out.get(t.course_id)!;
    if (t.kind === "topic") c.hours.set(t.id, Number(t.hours ?? 0));
    else {
      c.drives += Number(t.lessons ?? 0);
      c.driveList.push({ id: t.id, title: t.code, sort: t.sort, lessons: Number(t.lessons ?? 1) || 1 });
      c.driveList.sort((a, b) => a.sort - b.sort);
    }
  }
  return out;
}

// Planlagte lektioner fra holdtavlen (trin E11), fra i dag og frem: "elev:lektion" -> første dato.
export async function loadBoardPlans(schoolId: string, today: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scheduled_lessons")
    .select("lesson_date, student_ids, school_lesson_id, eu_topic_id")
    .eq("school_id", schoolId)
    .gte("lesson_date", today)
    .or("school_lesson_id.not.is.null,eu_topic_id.not.is.null")
    .order("lesson_date");
  const out = new Map<string, string>();
  for (const l of data ?? []) {
    const ref = l.school_lesson_id ?? l.eu_topic_id;
    for (const s of (l.student_ids as string[]) ?? []) if (!out.has(`${s}:${ref}`)) out.set(`${s}:${ref}`, l.lesson_date);
  }
  return out;
}
