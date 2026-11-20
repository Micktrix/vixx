import { notFound } from "next/navigation";
import { LessonStatus } from "@/components/lesson-status";
import { formatDate } from "@/lib/dates";
import { completionText, moduleProgress, progressText, suggestedModule, type ModuleCompletion, type ModuleCount, type PlanModule } from "@/lib/module-progress";
import { CompleteForm } from "./complete-form";
import { RepetitionForm } from "./repetition-form";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../../screen";
import { getTeacher } from "../../teacher-data";
import { ModuleForm } from "./module-form";

// Elevens QR-kode er scannet: se modulplanen, tæl teori eller kørsel i et modul, afslut modulet eller registrér
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
      "id, service_id, active, is_demo, manual_gear, profiles(full_name), teams(name), module_signoffs(course_module_id, kind, lesson_count, dark, manual_gear, lesson_date, module_lesson_id, skipped_items), repetition_lessons(id, lesson_date, lesson_count, instructor_name), module_completions(id, course_module_id, module_number, completed_on, instructor_id, instructor_name, transferred, self_study, comment, extra_theory, extra_driving, annulled_at, annul_reason), courses(name, category_code, course_modules(id, number, name, min_theory, min_driving, min_dark, topics, module_lessons(id, number, lesson_count, dark, location, content, notes, control_topic, sort_order, active)))",
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
  const team = student.teams as unknown as { name: string } | null;
  const course = student.courses as unknown as { name: string; category_code: string; course_modules: PlanModule[] } | null;
  const signed = typeof sp.kvitteret === "string" ? sp.kvitteret : null;

  if (!course?.course_modules.length) {
    return (
      <Screen title={name} sub={[team?.name, course?.name].filter(Boolean).join(" · ")} back={close}>
        <p className="rounded-[16px] bg-soft px-4 py-3 text-[15px]">Elevens forløb har ingen moduler endnu. Admin sætter det op under Forløb.</p>
      </Screen>
    );
  }

  const progress = moduleProgress(
    course.course_modules,
    (student.module_signoffs ?? []) as ModuleCount[],
    (student.module_completions ?? []) as ModuleCompletion[],
  );
  const suggested = suggestedModule(progress);
  return (
    <Screen title={name} sub={[team?.name, course.name].filter(Boolean).join(" · ")} back={close}>
      {signed && (
        <p role="status" className="rounded-[16px] border border-ok/30 bg-ok-bg px-4 py-3 text-[15px]" data-testid="signoff-done">
          <b className="text-ok">
            {signed === "Afsluttet"
              ? "✓ Modulet er afsluttet."
              : signed === "Lektion"
                ? "✓ Lektionen er kørt og talt med i modulet."
                : signed === "Repetition"
                ? "✓ Repetitionslektionerne er registreret."
                : "✓ Lektionerne er talt med i modulet."}
          </b>
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
      <ol className="flex flex-col gap-1.5 rounded-[20px] border border-line bg-surface p-4" data-testid="scan-modules">
        {progress.map((m) => (
          <li key={m.id} className="text-[15px]">
            <b>Modul {m.number}</b> {m.completed && <span className="text-ok">✓</span>}
            <span className="block text-[13px] text-muted">
              {progressText(m)}
              {m.startedOn && ` · startet ${formatDate(m.startedOn)}`}
            </span>
            {m.completed && <span className="block text-[13px] text-ok">{completionText(m.completed, formatDate)}</span>}
            {!m.completed && <LessonStatus module={m} />}
          </li>
        ))}
      </ol>
      {suggested ? (
        <>
          {suggested.ready && <CompleteForm token={token} studentId={student.id} module={suggested} />}
          <ModuleForm
            token={token}
            studentId={student.id}
            modules={progress.filter((m) => !m.completed)}
            suggestedId={suggested.id}
            manualGearModules={
              student.manual_gear && course.category_code === "B" ? progress.filter((m) => m.number >= 2 && m.number <= 5).map((m) => m.id) : []
            }
          />
          {!suggested.ready && <CompleteForm token={token} studentId={student.id} module={suggested} />}
        </>
      ) : (
        <>
          <p className="rounded-[16px] bg-ok-bg px-4 py-3 text-[15px] text-ok">Alle moduler er afsluttet.</p>
          {((student.repetition_lessons ?? []) as { id: string; lesson_date: string; lesson_count: number; instructor_name: string }[]).length > 0 && (
            <ul className="flex flex-col gap-1 text-sm" data-testid="scan-repetitions">
              {((student.repetition_lessons ?? []) as { id: string; lesson_date: string; lesson_count: number; instructor_name: string }[])
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
    </Screen>
  );
}
