import "server-only";
import { createClient } from "@/lib/supabase/server";

// Hold, elever og forløb til kontorets elevsider. En lektion er gennemført, når læreren har kvitteret
// (QR-scanning), og eleven har bekræftet.

export type CourseInfo = {
  id: string;
  name: string;
  category: string;
  theory: number; // antal teorilektioner i forløbet (0 = ingen)
  lessons: { id: string; number: string; count: number; kind: "driving" | "theory" }[];
};
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
  waiting: Set<string>; // kvitteret af læreren, venter på elevens bekræftelse
  signoffs: Map<string, Signoff>;
  theoryCount: number; // teorilektioner talt op (scannet eller givet af admin)
};
export type Signoff = { id: string; date: string; instructor: string; confirmed: boolean; skipped: string | null; comment: string | null };
export type TeamInfo = { id: string; name: string; courseId: string | null; startsOn: string | null; active: boolean };

export async function loadStudents(schoolId: string) {
  const supabase = await createClient();
  const [{ data: teams }, { data: students }, { data: courses }] = await Promise.all([
    supabase.from("teams").select("id, name, course_id, starts_on, active").eq("school_id", schoolId).order("name"),
    supabase
      .from("students")
      .select(
        "id, user_id, team_id, course_id, service_id, active, profiles(full_name, phone), lesson_signoffs(id, course_lesson_id, lesson_date, instructor_name, confirmed_at, skipped_items, comment), theory_signoffs(lesson_count)",
      )
      .eq("school_id", schoolId)
      .eq("is_demo", false), // admins demo-elev vises ikke i kontorets lister
    supabase
      .from("courses")
      .select("id, name, category_code, theory_lessons, course_lessons(id, number, kind, lesson_count, sort_order, active)")
      .eq("school_id", schoolId)
      .order("name"),
  ]);

  type LessonRow = { id: string; number: string; kind: "driving" | "theory"; lesson_count: number; sort_order: number; active: boolean };
  const courseList: CourseInfo[] = (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category_code,
    theory: c.theory_lessons,
    lessons: ((c.course_lessons ?? []) as LessonRow[])
      .filter((l) => l.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({ id: l.id, number: l.number, count: l.lesson_count, kind: l.kind })),
  }));
  const studentList: StudentInfo[] = (students ?? [])
    .map((s) => {
      const p = s.profiles as unknown as { full_name: string; phone: string } | null;
      const signoffs = new Map<string, Signoff>(
        (s.lesson_signoffs ?? []).map((x) => [
          x.course_lesson_id,
          { id: x.id, date: x.lesson_date, instructor: x.instructor_name, confirmed: !!x.confirmed_at, skipped: x.skipped_items, comment: x.comment },
        ]),
      );
      return {
        id: s.id,
        userId: s.user_id,
        name: p?.full_name ?? "",
        phone: p?.phone ?? "",
        teamId: s.team_id,
        courseId: s.course_id,
        serviceId: s.service_id,
        active: s.active,
        done: new Set([...signoffs].filter(([, x]) => x.confirmed).map(([id]) => id)),
        waiting: new Set([...signoffs].filter(([, x]) => !x.confirmed).map(([id]) => id)),
        signoffs,
        theoryCount: ((s.theory_signoffs ?? []) as { lesson_count: number }[]).reduce((n, t) => n + t.lesson_count, 0),
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

// Teori (0–total): tælleren plus teorilektioner i forløbet, der er kvitteret som lektioner.
export function theoryProgress(student: StudentInfo, course: CourseInfo | undefined) {
  const total = course?.theory ?? 0;
  const asLessons = (course?.lessons ?? []).filter((l) => l.kind === "theory" && student.signoffs.has(l.id)).reduce((n, l) => n + l.count, 0);
  return { done: student.theoryCount + asLessons, total };
}
