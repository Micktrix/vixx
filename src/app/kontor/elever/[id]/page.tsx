import Link from "next/link";
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
  addTheory,
  correctTheory,
  crossOffLesson,
  finishStudent,
  moveSignoff,
  reopenStudent,
  resetStudentPassword,
  saveStudentTeachers,
  updateStudent,
} from "../actions";
import { FINISH_LABEL, loadStudents, progress, theoryProgress } from "../data";
import { ProgressBar } from "../progress-bar";
import { StudentFields } from "../student-fields";

// Én elev: forløbet med hvad der er gennemført, og elevens oplysninger.
export default async function StudentPage({ params }: PageProps<"/kontor/elever/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const [{ teams, students, courses }, { data: services }, { data: instructors }, { data: booking }] = await Promise.all([
    loadStudents(membership.schoolId),
    supabase.from("services").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("sort_order").order("name"),
    supabase.from("instructors").select("id, active_until, school_members(active, profiles(full_name))").eq("school_id", membership.schoolId),
    supabase
      .from("students")
      .select("can_request, student_instructors(instructor_id), theory_signoffs(id, lesson_count, lesson_date, instructor_name, comment)")
      .eq("id", id)
      .maybeSingle(),
  ]);
  const student = students.find((s) => s.id === id);
  if (!student) notFound();
  const course = courses.find((c) => c.id === student.courseId);
  const team = teams.find((t) => t.id === student.teamId);
  const p = progress(student, course);
  const missing = course?.lessons.filter((l) => !student.signoffs.has(l.id)) ?? [];
  const isAdmin = membership.role === "admin";
  const theory = theoryProgress(student, course);
  const theoryRows = ((booking?.theory_signoffs ?? []) as { id: string; lesson_count: number; lesson_date: string; instructor_name: string; comment: string | null }[]).sort(
    (a, b) => b.lesson_date.localeCompare(a.lesson_date),
  );
  const linked = new Set(((booking?.student_instructors ?? []) as { instructor_id: string }[]).map((l) => l.instructor_id));
  const teachers = (instructors ?? [])
    .map((i) => {
      const m = i.school_members as unknown as { active: boolean; profiles: { full_name: string } | null } | null;
      return { id: i.id, name: m?.profiles?.full_name ?? "", active: !!m?.active && (!i.active_until || i.active_until >= todayDk()) };
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

      {course && (
        <Box title="Forløb" hint={`${p.done} af ${p.total} lektioner gennemført`}>
          <ProgressBar share={p.share} />
          <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="student-lessons">
            {course.lessons.map((l) => {
              const s = student.signoffs.get(l.id);
              return (
                <li
                  key={l.id}
                  data-lesson={l.number}
                  className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-[15px] ${
                    !s ? "border-line" : s.confirmed ? "border-ok/30 bg-ok-bg" : "border-accent-line bg-accent-bg"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <b>Lektion {l.number}</b>
                    <span className={`text-sm ${!s ? "text-muted" : s.confirmed ? "text-ok" : "text-accent-ink"}`}>
                      {!s ? `${l.count} × 45 min.` : s.confirmed ? "Gennemført" : "Venter på eleven"}
                    </span>
                  </span>
                  {s && (
                    <span className="text-[13px] text-muted">
                      {formatDate(s.date)}
                      {s.instructor && ` · ${s.instructor}`}
                      {s.skipped && ` · Ikke nået: ${s.skipped.split("\n").join(", ")}`}
                      {s.comment && ` · ${s.comment}`}
                    </span>
                  )}
                  {s && isAdmin && missing.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Ret lektion</summary>
                      <ActionForm action={moveSignoff} submitLabel="Flyt" pendingLabel="…" primary={false} className="mt-2 flex items-end gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <label className="flex flex-1 flex-col gap-1 text-[13px] font-bold">
                          Var i stedet
                          <select name="courseLessonId" required defaultValue={missing[0].id} className={inputClass}>
                            {missing.map((m) => (
                              <option key={m.id} value={m.id}>
                                Lektion {m.number}
                              </option>
                            ))}
                          </select>
                        </label>
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </Box>
      )}

      {course && isAdmin && missing.length > 0 && (
        <Box title="Kryds en lektion af" hint="Fx når en gæstelærer uden adgang til appen har kørt lektionen">
          <ActionForm action={crossOffLesson} submitLabel="Kryds af" confirmText="Kryds lektionen af? Det kan ikke fortrydes." className="flex flex-col gap-3">
            <input type="hidden" name="studentId" value={student.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[160px] flex-col gap-1.5 text-sm font-bold">
                Lektion
                <select name="courseLessonId" required defaultValue={missing[0].id} className={inputClass}>
                  {missing.map((l) => (
                    <option key={l.id} value={l.id}>
                      Lektion {l.number}
                    </option>
                  ))}
                </select>
              </label>
              <TextField label="Dato" name="date" type="date" required defaultValue={todayDk()} max={todayDk()} />
              <TextField label="Kommentar" name="comment" required maxLength={500} placeholder="Fx kørt af gæstelærer Per Hansen" className="min-w-[260px] flex-1" />
            </div>
            <p className="text-[13px] text-muted">Lektionen tæller som gennemført med det samme. Den kommer ikke med på lønnen og kan ikke slettes.</p>
          </ActionForm>
        </Box>
      )}

      {course && theory.total > 0 && (
        <Box title="Teori" hint={`${Math.min(theory.done, theory.total)} af ${theory.total} lektioner`}>
          <ProgressBar share={Math.min(1, theory.done / theory.total)} />
          <ul className="flex flex-col" data-testid="student-theory-rows">
            {theoryRows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-[15px] last:border-b-0">
                <span>
                  <b>
                    {t.lesson_count} {t.lesson_count === 1 ? "lektion" : "lektioner"}
                  </b>
                  <span className="text-sm text-muted">
                    {" "}
                    · {formatDate(t.lesson_date)}
                    {t.instructor_name && ` · ${t.instructor_name}`}
                    {t.comment && ` · ${t.comment}`}
                  </span>
                </span>
                {isAdmin && (
                  <ActionForm action={correctTheory} submitLabel="Ret" pendingLabel="…" primary={false} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <select name="count" defaultValue={t.lesson_count} aria-label="Antal" className={`${inputClass} w-[80px]`}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </ActionForm>
                )}
              </li>
            ))}
            {!theoryRows.length && <li className="text-sm text-muted">Ingen teori endnu. Læreren scanner elevens QR-kode og vælger &quot;Teori&quot;.</li>}
          </ul>
          {isAdmin && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Tilføj teori (fx gæstelærer)</summary>
              <ActionForm action={addTheory} submitLabel="Tilføj" className="mt-2 flex flex-wrap items-end gap-3">
                <input type="hidden" name="studentId" value={student.id} />
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  Antal
                  <select name="count" defaultValue="2" className={`${inputClass} w-[90px]`}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <TextField label="Dato" name="date" type="date" required defaultValue={todayDk()} max={todayDk()} />
                <TextField label="Kommentar" name="comment" required maxLength={500} placeholder="Fx teori med gæstelærer Per" className="min-w-[220px] flex-1" />
              </ActionForm>
            </details>
          )}
        </Box>
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
            value={{ courseId: student.courseId, teamId: student.teamId, serviceId: student.serviceId }}
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
              Eleven bliver inaktiv og logges ud. Intet slettes: kvitteringer, teori og lektioner gemmes til dokumentation, og eleven kan
              findes med søgningen.
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
          <p className="text-sm text-muted">Eleven logger ind med sit telefonnummer. Har eleven glemt sin kode, så nulstil den til telefonnummeret.</p>
        </ActionForm>
      </Box>
    </>
  );
}
