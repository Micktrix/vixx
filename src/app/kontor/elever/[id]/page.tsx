import Link from "next/link";
import { LessonStatus } from "@/components/lesson-status";
import { completionText, moduleProgress, progressText, suggestedModule } from "@/lib/module-progress";
import { notFound } from "next/navigation";
import { Box } from "@/components/box";
import { ActionForm, CheckChip, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { inputClass } from "@/components/styles";
import { formatDate, todayDk } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import {
  annulModuleCompletion,
  moveStudentPlanVersion,
  completeModuleForGuest,
  finishStudent,
  reopenStudent,
  resetStudentPassword,
  saveStudentTeachers,
  updateStudent,
} from "../actions";
import { courseStart, FINISH_LABEL, loadStudents, progress } from "../data";
import { ProgressBar } from "../progress-bar";
import { PlanTeachersBox } from "../plan-teachers";
import { StudentFields } from "../student-fields";

// Én elev: modulplanen med hvad der er gennemført, og elevens oplysninger.
export default async function StudentPage({ params }: PageProps<"/kontor/elever/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const [{ teams, students, courses }, { data: services }, { data: instructors }, { data: booking }, { data: planTeachers }] = await Promise.all([
    loadStudents(membership.schoolId),
    supabase.from("services").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("sort_order").order("name"),
    supabase.from("instructors").select("id, active_until, school_members(active, profiles(full_name))").eq("school_id", membership.schoolId),
    supabase.from("students").select("can_request, student_instructors(instructor_id)").eq("id", id).maybeSingle(),
    supabase.from("plan_teachers").select("instructor_id").eq("student_id", id),
  ]);
  const student = students.find((s) => s.id === id);
  if (!student) notFound();
  const course = courses.find((c) => c.id === student.courseId);
  const team = teams.find((t) => t.id === student.teamId);
  const p = progress(student, course);
  const isAdmin = membership.role === "admin";
  const modules = course?.modules.length ? moduleProgress(course.modules, student.moduleCounts, student.moduleCompletions, course.theoryAtScan) : [];
  const currentModule = suggestedModule(modules);
  const lastCompleted = [...modules].reverse().find((m) => m.completed);
  const annulled = student.moduleCompletions.filter((c) => c.annulled_at).sort((a, b) => a.module_number - b.module_number);
  const linked = new Set(((booking?.student_instructors ?? []) as { instructor_id: string }[]).map((l) => l.instructor_id));
  const teachers = (instructors ?? [])
    .map((i) => {
      const m = i.school_members as unknown as {
        active: boolean;
        profiles: { full_name: string } | null;
      } | null;
      return {
        id: i.id,
        name: m?.profiles?.full_name ?? "",
        active: !!m?.active && (!i.active_until || i.active_until >= todayDk()),
      };
    })
    .filter((t) => t.active || linked.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={team ? `/kontor/elever/hold/${team.id}` : "/kontor/elever"} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ {team ? team.name : "Elever/hold"}
        </Link>
        <h1 className="text-[30px] font-bold">{student.name}</h1>
        <p className="flex flex-wrap items-center gap-1.5 text-muted">
          {formatPhone(student.phone)} · {course?.name ?? "Intet forløb"}
          {student.finished ? (
            <Pill tone="ok">
              {FINISH_LABEL[student.finished.reason]} · {formatDate(student.finished.on)}
            </Pill>
          ) : (
            !student.active && <Pill>Ikke aktiv</Pill>
          )}
        </p>
      </header>

      {course && course.modules.length > 0 && (
        <Box title="Modulplan" hint={`${p.done} af ${p.total} moduler afsluttet`}>
          <a
            href={`/api/modulplan/${student.id}`}
            target="_blank"
            rel="noopener"
            className="self-start rounded-[12px] border border-line px-4 py-2 text-sm font-bold hover:border-accent"
            data-testid="print-module-plan"
          >
            Print modulplan (PDF)
          </a>
          <p className="text-sm text-muted">
            Start af modul 1: {formatDate(courseStart(student, team))}
            {student.eu && " · EU slået til"}
          </p>
          <PlanVersion studentId={student.id} courseId={student.courseId} current={student.planTemplateId} isAdmin={isAdmin} />
          <ProgressBar share={p.share} />
          <ol className="flex flex-col gap-1.5" data-testid="student-modules">
            {modules.map((m) => (
              <li key={m.id} className={`rounded-xl border px-3 py-2 text-[15px] ${m.completed ? "border-ok/30 bg-ok-bg" : "border-line"}`}>
                <b>
                  Modul {m.number} – {m.name}
                </b>
                <span className="block text-[13px] text-muted">
                  {progressText(m, course.theoryAtScan)}
                  {m.startedOn && ` · startet ${formatDate(m.startedOn)}`}
                </span>
                {m.completed && (
                  <span className="block text-[13px] text-ok">
                    {completionText(m.completed, formatDate)}
                    {m.completed.self_study && ` · Selvstudie: ${m.completed.self_study}`}
                    {m.completed.comment && ` · ${m.completed.comment}`}
                  </span>
                )}
                <LessonStatus module={m} />
                {isAdmin && m.id === lastCompleted?.id && m.completed && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Annullér afslutningen</summary>
                    <ActionForm
                      action={annulModuleCompletion}
                      submitLabel="Annullér"
                      pendingLabel="…"
                      primary={false}
                      confirmText={`Annullér afslutningen af modul ${m.number}? Modulet bliver åbent igen.`}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="id" value={m.completed.id} />
                      <TextField
                        label="Begrundelse"
                        name="reason"
                        required
                        maxLength={500}
                        placeholder="Fx afsluttet på den forkerte elev"
                        className="min-w-[240px] flex-1"
                      />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {student.repetitions.length > 0 && (
            <ul className="text-sm" data-testid="student-repetitions">
              {student.repetitions.map((r) => (
                <li key={r.id}>
                  <b>Repetition</b> {formatDate(r.lesson_date)}: {r.lesson_count} {r.lesson_count === 1 ? "lektion" : "lektioner"} ·{" "}
                  {r.instructor_name}
                </li>
              ))}
            </ul>
          )}
          {annulled.length > 0 && (
            <ul className="text-[13px] text-muted" data-testid="annulled-completions">
              {annulled.map((c) => (
                <li key={c.id}>
                  Annulleret: modul {c.module_number}, afsluttet {formatDate(c.completed_on)} af {c.instructor_name} · {c.annul_reason}
                </li>
              ))}
            </ul>
          )}
          {teachersOf(student).length > 0 && (
            <p className="text-sm" data-testid="module-teachers">
              <span className="text-muted">Undervisende kørelærere:</span> {teachersOf(student).join(", ")}
            </p>
          )}
        </Box>
      )}

      {isAdmin && currentModule && (
        <Box title={`Afslut modul ${currentModule.number} for en gæstelærer`} hint="Når en gæstelærer uden Vixx har afsluttet modulet">
          <ActionForm
            action={completeModuleForGuest}
            submitLabel={`Afslut modul ${currentModule.number}`}
            confirmText={`Afslut modul ${currentModule.number} for gæstelæreren?`}
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="studentId" value={student.id} />
            <input type="hidden" name="moduleId" value={currentModule.id} />
            <p className="text-sm">
              {progressText(currentModule, course!.theoryAtScan)}
              {currentModule.reached ? " · minimum er nået" : " · minimum er ikke nået: kun muligt, hvis eleven er overført fra lektionsplanen"}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <TextField label="Gæstelærerens navn" name="guestName" required maxLength={120} className="min-w-[200px] flex-1" />
              <TextField label="Dato" name="date" type="date" required defaultValue={todayDk()} max={todayDk()} />
            </div>
            <TextField label="Kommentar" name="comment" required maxLength={500} placeholder="Fx vikar uden adgang til Vixx" />
            <TextField label="Selvstudie (valgfrit)" name="selfStudy" maxLength={500} />
            {!course!.theoryAtScan && (
              <TextField
                label="Teorilektioner i modulet"
                name="theoryLessons"
                type="number"
                min={0}
                max={100}
                required
                defaultValue={currentModule.min_theory}
                className="w-[200px]"
              />
            )}
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="transferred" className="size-[18px] accent-accent" />
              Overført fra lektionsplan
            </label>
            <p className="text-[13px] text-muted">
              Erklæringen afgiver gæstelæreren ved at skrive under på den udskrevne modulplan. Vixx sætter ingen underskrift på.
            </p>
          </ActionForm>
        </Box>
      )}

      {!team && (
        <PlanTeachersBox
          target="student"
          id={student.id}
          teachers={teachers.filter((t) => t.active)}
          chosen={(planTeachers ?? []).map((t) => t.instructor_id)}
        />
      )}

      <Box title="Kørelektioner" hint="Faste lærere og anmodning om tider">
        <ActionForm action={saveStudentTeachers} submitLabel="Gem" className="flex flex-col gap-3">
          <input type="hidden" name="id" value={student.id} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold">Faste lærere</legend>
            <div className="flex flex-wrap gap-2" data-testid="student-teachers">
              {teachers.map((t) => (
                <CheckChip key={t.id} name="instructors" value={t.id} label={t.name} defaultChecked={linked.has(t.id)} />
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="canRequest" defaultChecked={!!booking?.can_request} className="size-[18px] accent-accent" />
            Må selv anmode om kørelektioner hos de faste lærere
          </label>
          <p className="text-[13px] text-muted">
            Alle elever ser deres lektioner i appen. Med fluebenet ser eleven også de faste læreres åbne tider og kan anmode om dem.
          </p>
        </ActionForm>
      </Box>

      <Box title="Oplysninger">
        <ActionForm action={updateStudent} submitLabel="Gem" className="flex flex-col gap-4">
          <input type="hidden" name="id" value={student.id} />
          <TextField label="Navn" name="fullName" required maxLength={80} defaultValue={student.name} className="max-w-[360px]" />
          <StudentFields
            courses={courses}
            teams={teams}
            services={services ?? []}
            value={{
              courseId: student.courseId,
              teamId: student.teamId,
              serviceId: student.serviceId,
              address: student.address,
              manualGear: student.manualGear,
              eu: student.eu,
              courseStartOn: student.courseStartOn,
            }}
          />
        </ActionForm>
      </Box>

      {student.finished || !student.active ? (
        <Box title="Forløbet er afsluttet">
          <ActionForm action={reopenStudent} submitLabel="Genåbn eleven" primary={false} confirmText="Gør eleven aktiv igen?">
            <input type="hidden" name="id" value={student.id} />
            <p className="text-[15px]" data-testid="student-finished">
              {student.finished ? `${FINISH_LABEL[student.finished.reason]} ${formatDate(student.finished.on)}.` : "Eleven er ikke aktiv."}
              {student.finished?.note && ` ${student.finished.note}`}
            </p>
            <p className="text-[13px] text-muted">
              Eleven kan ikke logge ind og vises ikke på holdtavlen. Kvitteringer og lektioner er gemt og kan ses her.
            </p>
          </ActionForm>
        </Box>
      ) : (
        <Box title="Afslut forløb" hint="Fx når eleven har bestået køreprøven">
          <ActionForm
            action={finishStudent}
            submitLabel="Afslut forløb"
            primary={false}
            confirmText="Afslut forløbet? Eleven kan ikke længere logge ind."
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="id" value={student.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Årsag
                <select name="reason" defaultValue="passed" className={`${inputClass} w-[220px]`}>
                  <option value="passed">Bestået køreprøve</option>
                  <option value="stopped">Stoppet</option>
                  <option value="other">Andet</option>
                </select>
              </label>
              <TextField label="Dato" name="date" type="date" required defaultValue={todayDk()} max={todayDk()} />
              <TextField label="Note (valgfri)" name="note" maxLength={300} className="min-w-[220px] flex-1" />
            </div>
            <p className="text-[13px] text-muted">
              Eleven bliver inaktiv og logges ud. Intet slettes: kvitteringer, teori og lektioner gemmes til dokumentation, og eleven kan findes med
              søgningen.
            </p>
          </ActionForm>
        </Box>
      )}

      <Box title="Login">
        <ActionForm
          action={resetStudentPassword}
          submitLabel="Nulstil kode"
          pendingLabel="…"
          primary={false}
          confirmText="Nulstil elevens kode til telefonnummeret og log eleven ud?"
        >
          <input type="hidden" name="id" value={student.id} />
          <p className="text-sm text-muted">
            Eleven logger ind med sit telefonnummer. Har eleven glemt sin kode, så nulstil den til telefonnummeret.
          </p>
        </ActionForm>
      </Box>
    </>
  );
}

// Undervisende kørelærere i modulplanen: alle, der har talt lektioner eller afsluttet et modul, i den rækkefølge
// de første gang havde eleven.
function teachersOf(student: {
  moduleCounts: { instructor_name?: string; lesson_date: string }[];
  moduleCompletions: {
    instructor_name: string;
    completed_on: string;
    annulled_at: string | null;
  }[];
}) {
  const seen = [
    ...student.moduleCounts.map((c) => ({
      name: c.instructor_name ?? "",
      date: c.lesson_date,
    })),
    ...student.moduleCompletions.filter((c) => !c.annulled_at).map((c) => ({ name: c.instructor_name, date: c.completed_on })),
  ]
    .filter((x) => x.name)
    .sort((a, b) => a.date.localeCompare(b.date));
  return [...new Set(seen.map((x) => x.name))];
}

// Elevens version af modulplanens PDF. Admin kan flytte eleven til en anden version i brug af forløbet.
async function PlanVersion({
  studentId,
  courseId,
  current,
  isAdmin,
}: {
  studentId: string;
  courseId: string;
  current: string | null;
  isAdmin: boolean;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("module_plan_templates")
    .select("id, version, builtin")
    .eq("course_id", courseId)
    .not("activated_at", "is", null)
    .order("activated_at");
  const versions = data ?? [];
  const label = (v: { version: string; builtin: string | null }) => `Version ${v.version}${v.builtin ? " (indbygget)" : ""}`;
  const mine = versions.find((v) => v.id === current);
  if (!isAdmin || versions.length < 2) {
    return (
      <p className="text-sm text-muted" data-testid="plan-version">
        Modulplanens PDF: {mine ? label(mine) : "ingen version"}
      </p>
    );
  }
  return (
    <ActionForm action={moveStudentPlanVersion} submitLabel="Flyt" pendingLabel="…" primary={false} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <label className="flex flex-col gap-1 text-sm font-bold">
        Modulplanens PDF
        <select name="templateId" defaultValue={current ?? ""} className={inputClass} data-testid="plan-version-select">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {label(v)}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}
