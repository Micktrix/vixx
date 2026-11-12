import "server-only";
import { createClient } from "@/lib/supabase/server";

// Hold, elever og forløb til kontorets elevsider. Gennemførte lektioner kommer med QR-kvittering (trin E3);
// indtil da er `done` tom.

export type CourseInfo = { id: string; name: string; category: string; lessons: { id: string; number: string; count: number }[] };
export type StudentInfo = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  teamId: string | null;
  courseId: string;
  serviceId: string | null;
  active: boolean;
  done: Set<string>; // course_lesson-id'er, der er kvitteret og bekræftet
};
export type TeamInfo = { id: string; name: string; courseId: string | null; startsOn: string | null; active: boolean };

export async function loadStudents(schoolId: string) {
  const supabase = await createClient();
  const [{ data: teams }, { data: students }, { data: courses }] = await Promise.all([
    supabase.from("teams").select("id, name, course_id, starts_on, active").eq("school_id", schoolId).order("name"),
    supabase
      .from("students")
      .select("id, user_id, team_id, course_id, service_id, active, profiles(full_name, phone)")
      .eq("school_id", schoolId),
    supabase
      .from("courses")
      .select("id, name, category_code, course_lessons(id, number, lesson_count, sort_order, active)")
      .eq("school_id", schoolId)
      .order("name"),
  ]);

  type LessonRow = { id: string; number: string; lesson_count: number; sort_order: number; active: boolean };
  const courseList: CourseInfo[] = (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category_code,
    lessons: ((c.course_lessons ?? []) as LessonRow[])
      .filter((l) => l.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({ id: l.id, number: l.number, count: l.lesson_count })),
  }));
  const studentList: StudentInfo[] = (students ?? [])
    .map((s) => {
      const p = s.profiles as unknown as { full_name: string; phone: string } | null;
      return {
        id: s.id,
        userId: s.user_id,
        name: p?.full_name ?? "",
        phone: p?.phone ?? "",
        teamId: s.team_id,
        courseId: s.course_id,
        serviceId: s.service_id,
        active: s.active,
        done: new Set<string>(),
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

// Andel gennemført (0–1) af elevens forløb.
export function progress(student: StudentInfo, course: CourseInfo | undefined) {
  const total = course?.lessons.length ?? 0;
  const done = course ? course.lessons.filter((l) => student.done.has(l.id)).length : 0;
  return { done, total, share: total ? done / total : 0 };
}
