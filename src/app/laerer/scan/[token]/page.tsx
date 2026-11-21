import { notFound } from "next/navigation";
import { formatDate, todayDk } from "@/lib/dates";
import {
  lessonsWord,
  moduleProgress,
  progressText,
  suggestedModule,
  teachingDays,
  type ModuleCompletion,
  type ModuleCount,
  type PlanModule,
} from "@/lib/module-progress";
import { RepetitionForm } from "./repetition-form";
import { ScanForm } from "./scan-form";
import { createClient } from "@/lib/supabase/server";
import { FactsStrip } from "@/components/facts-strip";
import { ModuleDetails } from "@/components/module-details";
import type { Appointment } from "@/lib/appointments";
import { Screen } from "../../screen";
import { getTeacher } from "../../teacher-data";

// Elevens QR-kode er scannet: bekræft lektioner i et modul (og afslut det i samme tryk) eller registrér
// repetition. Det gælder kun elevens forløb; timen til lønnen registreres i kalenderen. Kun lærere fra elevens
// skole kan se eleven (RLS).
export default async function SignoffPage({ params, searchParams }: PageProps<"/laerer/scan/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const teacher = await getTeacher();
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, service_id, active, is_demo, student_appointments(id, kind, on_date, at_time, address, status, created_at), manual_gear, created_at, course_start_on, profiles(full_name), teams(name, starts_on), module_signoffs(course_module_id, kind, lesson_count, dark, manual_gear, lesson_date, skipped_items, instructor_name), repetition_lessons(id, lesson_date, lesson_count, instructor_name), module_completions(id, course_module_id, module_number, completed_on, started_on, instructor_id, instructor_name, transferred, self_study, comment, theory_lessons, extra_theory, extra_driving, annulled_at, annul_reason), courses(name, category_code, theory_at_scan, min_days, course_modules(id, number, name, min_theory, min_driving, min_dark, topics))",
    )
    .eq("school_id", teacher.membership.schoolId)
    .eq("qr_token", token)
    .maybeSingle();

  const close = { href: "/laerer/scan", label: "Scan en anden elev" };
  if (!student || !student.active) {
    return (
      <Screen title="Ukendt elev" sub="Scan en elev" back={close}>
        <p className="rounded-[16px] border border-bad/30 bg-bad-bg px-4 py-3 text-bad">
          Koden passer ikke til en aktiv elev på din skole. Bed eleven åbne koden igen i Vixx.
        </p>
      </Screen>
    );
  }

  const name = (student.profiles as unknown as { full_name: string } | null)?.full_name ?? "";
  const team = student.teams as unknown as {
    name: string;
    starts_on: string | null;
  } | null;
  const course = student.courses as unknown as {
    name: string;
    category_code: string;
    theory_at_scan: boolean;
    min_days: number | null;
    course_modules: PlanModule[];
  } | null;
  // Besked efter gem, fx "✓ 2 kørselslektioner er bekræftet i modul 2."
  const n = Number(sp.n);
  const signed =
    typeof sp.kvitteret === "string"
      ? "✓ Repetitionslektionerne er registreret."
      : typeof sp.m === "string"
        ? n > 0
          ? `✓ ${lessonsWord(n, sp.k === "theory" ? "theory" : "driving")} er bekræftet${sp.a === "1" ? `, og modul ${sp.m} er afsluttet.` : ` i modul ${sp.m}.`}`
          : `✓ Modul ${sp.m} er afsluttet.`
        : null;

  if (!course?.course_modules.length) {
    return (
      <Screen title={name} sub={[team?.name, course?.name].filter(Boolean).join(" · ")} back={close}>
        <p className="rounded-[16px] bg-soft px-4 py-3 text-[15px]">Elevens forløb har ingen moduler endnu. Admin sætter det op under Forløb.</p>
      </Screen>
    );
  }

  const signoffs = (student.module_signoffs ?? []) as ModuleCount[];
  const progress = moduleProgress(course.course_modules, signoffs, (student.module_completions ?? []) as ModuleCompletion[], course.theory_at_scan);
  const suggested = suggestedModule(progress);
  // Undervisningsdage (advarsel ved sidste modul): scanningsdage, når teori scannes, ellers hverdage fra start.
  const today = todayDk();
  const courseStart = student.course_start_on ?? team?.starts_on ?? todayDk(new Date(student.created_at));
  const days = teachingDays({
    theoryAtScan: course.theory_at_scan,
    courseStart,
    scanDates: signoffs.map((s) => s.lesson_date),
    today,
  });
  const daysWarning =
    course.min_days && days < course.min_days
      ? `Eleven har haft ${days} undervisningsdage${course.theory_at_scan ? "" : ` siden ${formatDate(courseStart)}`}. Minimum er ${course.min_days}.`
      : null;
  return (
    <Screen title={name} sub={[team?.name, course.name].filter(Boolean).join(" · ")} back={close}>
      {signed && (
        <p role="status" className="rounded-[16px] border border-ok/30 bg-ok-bg px-4 py-3 text-[15px]" data-testid="signoff-done">
          <b className="text-ok">{signed}</b>
        </p>
      )}
      <a
        href={`/api/modulplan/${student.id}`}
        target="_blank"
        rel="noopener"
        className="self-start text-sm font-bold text-accent-ink"
        data-testid="print-module-plan"
      >
        Se og print modulplanen (PDF) ›
      </a>
      <FactsStrip modules={progress} appointments={(student.student_appointments ?? []) as Appointment[]} />
      {suggested ? (
        <ScanForm
          key={signed ?? ""}
          token={token}
          studentId={student.id}
          modules={progress}
          suggestedId={suggested.id}
          theoryAtScan={course.theory_at_scan}
          manualGearModules={
            student.manual_gear && course.category_code === "B" ? progress.filter((m) => m.number >= 2 && m.number <= 5).map((m) => m.id) : []
          }
          lastModuleId={progress.at(-1)!.id}
          daysWarning={daysWarning}
          today={today}
        />
      ) : (
        <>
          <p className="rounded-[16px] bg-ok-bg px-4 py-3 text-[15px] text-ok">Alle moduler er afsluttet.</p>
          {(
            (student.repetition_lessons ?? []) as {
              id: string;
              lesson_date: string;
              lesson_count: number;
              instructor_name: string;
            }[]
          ).length > 0 && (
            <ul className="flex flex-col gap-1 text-sm" data-testid="scan-repetitions">
              {(
                (student.repetition_lessons ?? []) as {
                  id: string;
                  lesson_date: string;
                  lesson_count: number;
                  instructor_name: string;
                }[]
              )
                .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))
                .map((r) => (
                  <li key={r.id}>
                    Repetition {formatDate(r.lesson_date)}: {r.lesson_count} {r.lesson_count === 1 ? "lektion" : "lektioner"} · {r.instructor_name}
                  </li>
                ))}
            </ul>
          )}
          <RepetitionForm token={token} studentId={student.id} />
        </>
      )}
      <section className="flex flex-col gap-1.5" data-testid="scan-course">
        <h2 className="text-[17px] font-bold">Elevens forløb</h2>
        {progress.map((m) => (
          <details key={m.id} className={`rounded-[14px] border px-3 py-2 ${m.completed ? "border-ok/30 bg-ok-bg" : "border-line bg-surface"}`}>
            <summary className="cursor-pointer list-none text-[15px]">
              <b>
                <span className="mr-1.5 text-muted">›</span>Modul {m.number}
              </b>
              <span className="block text-[13px] text-muted">{progressText(m, course.theory_at_scan)}</span>
            </summary>
            <ModuleDetails module={m} counts={signoffs} theoryAtScan={course.theory_at_scan} />
          </details>
        ))}
      </section>
    </Screen>
  );
}
