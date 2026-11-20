import "server-only";
import { type ModuleCompletion, type ModuleCount, type PlanModule } from "@/lib/module-progress";
import { createClient } from "@/lib/supabase/server";

// Hold, elever og forløb (modulplaner) til kontorets elevsider. Et modul er gennemført, når læreren har
// afsluttet det.

export type CourseInfo = {
  id: string;
  name: string;
  category: string;
  modules: PlanModule[];
};
export type StudentInfo = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  address: string | null; // står på modulplanen
  manualGear: boolean; // kode 78 (kun B)
  planTemplateId: string | null; // elevens version af modulplanens PDF
  repetitions: { id: string; lesson_date: string; lesson_count: number; instructor_name: string }[];
  teamId: string | null;
  courseId: string;
  serviceId: string | null;
  active: boolean;
  finished: Finished | null; // forløbet er afsluttet (fx bestået køreprøve); eleven er inaktiv
  moduleCounts: ModuleCount[]; // lektioner talt i modulerne
  moduleCompletions: ModuleCompletion[]; // afsluttede moduler
};
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
        "id, user_id, team_id, course_id, service_id, address, manual_gear, plan_template_id, active, finished_on, finish_reason, finish_note, profiles(full_name, phone), module_signoffs(course_module_id, kind, lesson_count, dark, manual_gear, lesson_date, instructor_name, module_lesson_id, skipped_items), repetition_lessons(id, lesson_date, lesson_count, instructor_name), module_completions(id, course_module_id, module_number, completed_on, instructor_id, instructor_name, transferred, self_study, comment, extra_theory, extra_driving, annulled_at, annul_reason)",
      )
      .eq("school_id", schoolId)
      .eq("is_demo", false), // admins demo-elev vises ikke i kontorets lister
    supabase
      .from("courses")
      .select("id, name, category_code, course_modules(id, number, name, min_theory, min_driving, min_dark, module_lessons(id, number, lesson_count, dark, location, content, notes, control_topic, sort_order, active))")
      .eq("school_id", schoolId)
      .order("name"),
  ]);

  const courseList: CourseInfo[] = (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category_code,
    modules: (c.course_modules ?? []) as PlanModule[],
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
        planTemplateId: s.plan_template_id,
        repetitions: ((s.repetition_lessons ?? []) as StudentInfo["repetitions"]).sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)),
        teamId: s.team_id,
        courseId: s.course_id,
        serviceId: s.service_id,
        active: s.active,
        finished: s.finished_on ? { on: s.finished_on, reason: s.finish_reason as Finished["reason"], note: s.finish_note } : null,
        moduleCounts: (s.module_signoffs ?? []) as ModuleCount[],
        moduleCompletions: (s.module_completions ?? []) as ModuleCompletion[],
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

// Andel gennemført (0–1) af elevens forløb: moduler, der er afsluttet (annullerede tæller ikke).
export function progress(student: StudentInfo, course: CourseInfo | undefined) {
  const total = course?.modules.length ?? 0;
  const done = course ? student.moduleCompletions.filter((c) => !c.annulled_at && course.modules.some((m) => m.id === c.course_module_id)).length : 0;
  return { done, total, share: total ? done / total : 0 };
}
