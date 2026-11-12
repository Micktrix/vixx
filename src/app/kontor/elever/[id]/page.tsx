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
import { crossOffLesson, moveSignoff, resetStudentPassword, saveStudentTeachers, updateStudent } from "../actions";
import { loadStudents, progress } from "../data";
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
    supabase.from("students").select("can_request, student_instructors(instructor_id)").eq("id", id).maybeSingle(),
  ]);
  const student = students.find((s) => s.id === id);
  if (!student) notFound();
  const course = courses.find((c) => c.id === student.courseId);
  const team = teams.find((t) => t.id === student.teamId);
  const p = progress(student, course);
  const missing = course?.lessons.filter((l) => !student.signoffs.has(l.id)) ?? [];
  const isAdmin = membership.role === "admin";
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
          {!student.active && <Pill>Ikke aktiv</Pill>}
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
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="active" defaultChecked={student.active} className="size-[18px] accent-accent" />
            Aktiv elev (kan logge ind)
          </label>
        </ActionForm>
      </Box>

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
