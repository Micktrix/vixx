import Link from "next/link";
import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { saveTeam } from "./actions";
import { loadStudents, progress } from "./data";
import { ProgressBar } from "./progress-bar";

const linkButton = "inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink";

// Kontor → Elever: hold med elever og deres fremskridt i forløbet.
export default async function StudentsPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const { teams, students, courses } = await loadStudents(membership.schoolId);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const withoutTeam = students.filter((s) => !s.teamId && s.active);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Elever</h1>
        </div>
        <Link href="/kontor/elever/ny" className={linkButton}>
          + Ny elev
        </Link>
      </header>

      {!courses.length && (
        <p className="rounded-xl border border-accent-line bg-accent-bg px-3.5 py-2.5 text-sm">
          Der er ingen forløb endnu. Admin opretter dem under Indstillinger → Forløb, før elever kan oprettes.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="teams">
        {teams.map((t) => {
          const members = students.filter((s) => s.teamId === t.id && s.active);
          const course = t.courseId ? courseById.get(t.courseId) : undefined;
          const avg = members.length
            ? members.reduce((n, s) => n + progress(s, courseById.get(s.courseId)).share, 0) / members.length
            : 0;
          return (
            <Link
              key={t.id}
              href={`/kontor/elever/hold/${t.id}`}
              className={`flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4 hover:border-accent ${t.active ? "" : "opacity-60"}`}
              data-testid="team-card"
            >
              <span className="flex items-center justify-between gap-2">
                <b className="text-[17px]">{t.name}</b>
                {!t.active && <Pill>Afsluttet</Pill>}
              </span>
              <span className="text-sm text-muted">
                {members.length} {members.length === 1 ? "elev" : "elever"}
                {course ? ` · ${course.name}` : ""}
                {t.startsOn ? ` · start ${formatDate(t.startsOn)}` : ""}
              </span>
              <ProgressBar share={avg} />
            </Link>
          );
        })}
      </section>

      <Box title="Nyt hold">
        <ActionForm action={saveTeam} submitLabel="Opret hold" className="flex flex-wrap items-end gap-3">
          <TextField label="Navn" name="name" required maxLength={80} placeholder="Fx C-hold uge 48" className="min-w-[200px] flex-1" />
          <label className="flex min-w-[200px] flex-col gap-1.5 text-sm font-bold">
            Forløb (valgfri)
            <select name="courseId" defaultValue="" className={inputClass}>
              <option value="">Intet</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <TextField label="Start (valgfri)" name="startsOn" type="date" />
        </ActionForm>
      </Box>

      {withoutTeam.length > 0 && (
        <Box title={`Elever uden hold (${withoutTeam.length})`}>
          <ul className="flex flex-col">
            {withoutTeam.map((s) => {
              const p = progress(s, courseById.get(s.courseId));
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                  <Link href={`/kontor/elever/${s.id}`} className="font-bold hover:text-accent-ink hover:underline">
                    {s.name}
                  </Link>
                  <span className="text-sm text-muted">
                    {courseById.get(s.courseId)?.name} · {p.done}/{p.total}
                  </span>
                </li>
              );
            })}
          </ul>
        </Box>
      )}
    </>
  );
}
