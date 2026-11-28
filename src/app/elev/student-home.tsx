import Link from "next/link";
import type { ReactNode } from "react";
import { moduleProgress, type ModuleCompletion, type ModuleCount, type PlanModule } from "@/lib/module-progress";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../laerer/screen";
import { StudentModules } from "./student-modules";
import { LessonPlanList } from "@/components/lesson-plan-list";
import type { LessonSignoff, SchoolLesson } from "@/lib/lesson-plan";
import { FactsStrip } from "@/components/facts-strip";
import { euTestKinds, type Appointment } from "@/lib/appointments";
import { EU_SIGNOFF_FIELDS, EU_TOPIC_FIELDS, euOfText, euProgress, type EuSignoff, type EuTopic } from "@/lib/eu";
import { formatDate } from "@/lib/dates";
import { ToConfirmBox, type ToConfirm } from "./to-confirm";

// Elevens forside: QR-koden, som læreren scanner, og modulplanen med lektioner talt op mod minimum, opstart og
// afslutning pr. modul. Bruges af elevens app og af admins demo-elev i kontoret.
export async function StudentHome({
  studentId,
  firstName,
  schoolName,
  action,
  qrHref = "/elev/qr",
  demo = false,
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
      "id, eu_course_id, teams(name), student_appointments(id, kind, on_date, at_time, address, status, created_at), module_signoffs(course_module_id, kind, lesson_count, dark, lesson_date, skipped_items), lesson_signoffs(school_lesson_id, lesson_date, instructor_name, skipped), module_completions(id, course_module_id, module_number, completed_on, instructor_id, instructor_name, transferred, self_study, comment, extra_theory, extra_driving, annulled_at, annul_reason), courses!students_school_id_course_id_fkey(name, theory_at_scan, course_modules(id, number, name, min_theory, min_driving, min_dark, topics), school_lessons(id, number, title, kind, units, items, control, note))",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return null;
  // Scanninger, der venter på elevens bekræftelse (ikke for demo-eleven, som ingen logger ind som).
  const { data: school } = await supabase.from("students").select("school_id").eq("id", studentId).single();
  const [{ data: toConfirm }, { data: signature }] = demo
    ? [{ data: [] }, { data: null }]
    : await Promise.all([
        supabase.rpc("student_to_confirm", { p_school: school!.school_id }),
        supabase.rpc("student_my_signature", { p_school: school!.school_id }),
      ]);

  const course = student.courses as unknown as { name: string; theory_at_scan: boolean; course_modules: (PlanModule & { topics: string | null })[]; school_lessons: SchoolLesson[] } | null;
  const team = student.teams as unknown as { name: string } | null;
  const eu = student.eu_course_id ? await loadStudentEu(supabase, student.id, student.eu_course_id) : null;
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
      <ToConfirmBox items={(toConfirm ?? []) as ToConfirm[]} hasSignature={!!signature} />
      {course?.course_modules.length ? (
        <>
        <FactsStrip
          title="Prøver og aftaler"
          modules={modules!}
          appointments={(student.student_appointments ?? []) as Appointment[]}
          extra={euTestKinds(eu?.kind)}
        />
        {course.school_lessons?.length ? (
          <section className="flex flex-col gap-2" data-testid="student-lessons">
            <h2 className="text-xl font-bold">
              {course.name}
              {team?.name && <span className="block text-[15px] font-normal text-muted">{team.name}</span>}
            </h2>
            <LessonPlanList lessons={course.school_lessons} signoffs={(student.lesson_signoffs ?? []) as LessonSignoff[]} hideDone />
          </section>
        ) : (
        <StudentModules
          courseName={course.name}
          teamName={team?.name ?? null}
          modules={modules!}
          theoryAtScan={course.theory_at_scan}
          topics={new Map(course.course_modules.map((m) => [m.id, m.topics]))}
        />
        )}
        {/* EU under kørekortet: eleven tager altid kategorien før EU (Michael 26. nov. 2026). */}
        {eu && <StudentEu eu={eu} />}
        </>
      ) : (
        <p className="rounded-[16px] bg-soft px-4 py-3 text-[15px]">Dit forløb er ikke sat op endnu. Spørg på kontoret.</p>
      )}
    </Screen>
  );
}

// Elevens EU-forløb (trin E9b): timer og emner, som lærerne har bekræftet.
async function loadStudentEu(supabase: Awaited<ReturnType<typeof createClient>>, studentId: string, courseId: string) {
  const [{ data: course }, { data: topics }, { data: signoffs }] = await Promise.all([
    supabase.from("courses").select("name, kind").eq("id", courseId).maybeSingle(),
    supabase.from("eu_topics").select(EU_TOPIC_FIELDS).eq("course_id", courseId),
    supabase.from("eu_signoffs").select(EU_SIGNOFF_FIELDS).eq("student_id", studentId),
  ]);
  return { name: course?.name ?? "EU", kind: course?.kind as string | undefined, progress: euProgress((topics ?? []) as EuTopic[], (signoffs ?? []) as EuSignoff[]) };
}

function StudentEu({ eu }: { eu: NonNullable<Awaited<ReturnType<typeof loadStudentEu>>> }) {
  const p = eu.progress;
  return (
    <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-4" data-testid="student-eu">
      <h2 className="text-xl font-bold">{eu.name}</h2>
      <p className="text-[14px] text-muted">
        {euOfText(p.hoursDone, p.hoursTotal)} · {p.driveLessons} køretimer á 45 min.
      </p>
      <ul className="flex flex-col gap-0.5 text-[14px]">
        {p.topics.map((t) => (
          <li key={t.id} className={t.done ? "text-ok" : "text-muted"}>
            {t.done ? "✓" : "○"} <b>{t.code}</b> {t.goal}
            {t.done && ` · ${formatDate(t.done.signed_on)}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
