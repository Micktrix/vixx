import Link from "next/link";
import { notFound } from "next/navigation";
import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { resetStudentPassword, updateStudent } from "../actions";
import { loadStudents, progress } from "../data";
import { ProgressBar } from "../progress-bar";
import { StudentFields } from "../student-fields";

// Én elev: forløbet med hvad der er gennemført, og elevens oplysninger.
export default async function StudentPage({ params }: PageProps<"/kontor/elever/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const [{ teams, students, courses }, { data: services }] = await Promise.all([
    loadStudents(membership.schoolId),
    supabase.from("services").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("sort_order").order("name"),
  ]);
  const student = students.find((s) => s.id === id);
  if (!student) notFound();
  const course = courses.find((c) => c.id === student.courseId);
  const team = teams.find((t) => t.id === student.teamId);
  const p = progress(student, course);

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={team ? `/kontor/elever/hold/${team.id}` : "/kontor/elever"} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ {team ? team.name : "Elever"}
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
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Box>
      )}

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
