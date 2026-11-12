import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { saveTeam } from "../../actions";
import { loadStudents } from "../../data";
import { ProgressBoard } from "../../progress-board";

// Ét hold: forløbstavle for holdets elever (pr. forløb) og holdets oplysninger.
export default async function TeamPage({ params }: PageProps<"/kontor/elever/hold/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin", "office"]);
  const { teams, students, courses } = await loadStudents(membership.schoolId);
  const team = teams.find((t) => t.id === id);
  if (!team) notFound();
  const members = students.filter((s) => s.teamId === team.id);
  const active = members.filter((s) => s.active);
  // Holdets elever kan have forskellige forløb; der vises en tavle pr. forløb.
  const groups = courses
    .map((c) => ({ course: c, students: active.filter((s) => s.courseId === c.id) }))
    .filter((g) => g.students.length);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/kontor/elever" className="text-sm font-semibold text-muted hover:text-ink">
            ‹ Elever
          </Link>
          <h1 className="text-[30px] font-bold">{team.name}</h1>
          <p className="flex flex-wrap items-center gap-1.5 text-muted">
            {active.length} {active.length === 1 ? "elev" : "elever"}
            {team.startsOn ? ` · start ${formatDate(team.startsOn)}` : ""}
            {!team.active && <Pill>Afsluttet</Pill>}
          </p>
        </div>
        {team.active && (
          <Link
            href={`/kontor/elever/ny?hold=${team.id}`}
            className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
          >
            + Elev på holdet
          </Link>
        )}
      </header>

      {groups.map((g) => (
        <ProgressBoard key={g.course.id} course={g.course} students={g.students} />
      ))}
      {!active.length && <p className="text-muted">Ingen elever på holdet endnu.</p>}

      <details className="rounded-[20px] border border-line bg-surface p-[18px]">
        <summary className="cursor-pointer font-bold">Ret holdet</summary>
        <ActionForm action={saveTeam} submitLabel="Gem" className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="id" value={team.id} />
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="Navn" name="name" required maxLength={80} defaultValue={team.name} className="min-w-[200px] flex-1" />
            <label className="flex min-w-[200px] flex-col gap-1.5 text-sm font-bold">
              Forløb (valgfri)
              <select name="courseId" defaultValue={team.courseId ?? ""} className={inputClass}>
                <option value="">Intet</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Start (valgfri)" name="startsOn" type="date" defaultValue={team.startsOn ?? ""} />
          </div>
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="active" defaultChecked={team.active} className="size-[18px] accent-accent" />
            Holdet er i gang (fjern fluebenet, når holdet er afsluttet)
          </label>
        </ActionForm>
      </details>
    </>
  );
}
