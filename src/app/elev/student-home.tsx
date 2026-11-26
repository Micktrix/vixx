import Link from "next/link";
import type { ReactNode } from "react";
import { moduleProgress, type ModuleCompletion, type ModuleCount, type PlanModule } from "@/lib/module-progress";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../laerer/screen";
import { StudentModules } from "./student-modules";
import { FactsStrip } from "@/components/facts-strip";
import type { Appointment } from "@/lib/appointments";

// Elevens forside: QR-koden, som læreren scanner, og modulplanen med lektioner talt op mod minimum, opstart og
// afslutning pr. modul. Bruges af elevens app og af admins demo-elev i kontoret.
export async function StudentHome({
  studentId,
  firstName,
  schoolName,
  action,
  qrHref = "/elev/qr",
}: {
  studentId: string;
  firstName: string;
  schoolName: string;
  action?: ReactNode;
  qrHref?: string;
  demo?: boolean; // demo-eleven i kontoret (vises som eleven)
}) {
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, teams(name), student_appointments(id, kind, on_date, at_time, address, status, created_at), module_signoffs(course_module_id, kind, lesson_count, dark, lesson_date, skipped_items), module_completions(id, course_module_id, module_number, completed_on, instructor_id, instructor_name, transferred, self_study, comment, extra_theory, extra_driving, annulled_at, annul_reason), courses!students_school_id_course_id_fkey(name, theory_at_scan, course_modules(id, number, name, min_theory, min_driving, min_dark, topics))",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return null;

  const course = student.courses as unknown as { name: string; theory_at_scan: boolean; course_modules: (PlanModule & { topics: string | null })[] } | null;
  const team = student.teams as unknown as { name: string } | null;
  const modules = course
    ? moduleProgress(
        course.course_modules,
        (student.module_signoffs ?? []) as ModuleCount[],
        (student.module_completions ?? []) as ModuleCompletion[],
        course.theory_at_scan,
      )
    : null;

  return (
    <Screen title={`Hej ${firstName}`} sub={schoolName} action={action}>
      <Link href={qrHref} className="flex items-center justify-center rounded-[18px] bg-accent px-4 py-4 text-[17px] font-bold text-ink">
        Vis min QR-kode
      </Link>
      {course?.course_modules.length ? (
        <>
        <FactsStrip title="Prøver og aftaler" modules={modules!} appointments={(student.student_appointments ?? []) as Appointment[]} />
        <StudentModules
          courseName={course.name}
          teamName={team?.name ?? null}
          modules={modules!}
          theoryAtScan={course.theory_at_scan}
          topics={new Map(course.course_modules.map((m) => [m.id, m.topics]))}
        />
        </>
      ) : (
        <p className="rounded-[16px] bg-soft px-4 py-3 text-[15px]">Dit forløb er ikke sat op endnu. Spørg på kontoret.</p>
      )}
    </Screen>
  );
}
