import Link from "next/link";
import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { matchesStudent } from "@/lib/student-search";
import { saveTeam, setTeamActive } from "./actions";
import { loadStudents, progress } from "./data";
import { ProgressBar } from "./progress-bar";

const linkButton = "inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink";

// Kontor → Elever: søgning efter en elev på tværs af hold, nyt hold, og holdene som liste (aktive først,
// afsluttede nederst) med elevernes fremskridt i forløbet.
export default async function StudentsPage({ searchParams }: PageProps<"/kontor/elever">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const { teams, students, courses } = await loadStudents(membership.schoolId);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const withoutTeam = students.filter((s) => !s.teamId && s.active);
  const sorted = [...teams].sort((a, b) => Number(b.active) - Number(a.active));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  // Aktive elever på aktive hold først; elever på afsluttede hold og inaktive elever nederst.
  const current = (s: (typeof students)[number]) => s.active && (!s.teamId || !!teamById.get(s.teamId)?.active);
  const found = query
    ? students.filter((s) => matchesStudent(query, s.name, s.phone)).sort((a, b) => Number(current(b)) - Number(current(a)))
    : [];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Elever/hold</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/kontor/elever" role="search" className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Søg elev"
              placeholder="Søg elev (navn eller telefon)"
              className={`${inputClass} w-[260px]`}
            />
            <button type="submit" className="inline-flex h-11 items-center rounded-xl border border-line2 bg-surface px-4 text-[15px] font-bold">
              Søg
            </button>
          </form>
          <Link href="/kontor/elever/ny" className={linkButton}>
            + Ny elev
          </Link>
        </div>
      </header>

      {query && (
        <Box title={`Søgning: "${query}"`} hint={found.length === 1 ? "1 elev" : `${found.length} elever`}>
          {found.length ? (
            <ul className="flex flex-col" data-testid="search-results">
              {found.map((s) => {
                const team = s.teamId ? teamById.get(s.teamId) : undefined;
                const course = courseById.get(s.courseId);
                const p = progress(s, course);
                return (
                  <li key={s.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2.5 last:border-b-0 ${current(s) ? "" : "text-muted"}`}>
                    <Link href={`/kontor/elever/${s.id}`} className="min-w-[180px] font-bold text-ink hover:text-accent-ink hover:underline">
                      {s.name}
                    </Link>
                    <span className="text-sm">{formatPhone(s.phone)}</span>
                    <span className="flex items-center gap-1.5 text-sm">
                      {team ? team.name : "Intet hold"}
                      {team && !team.active && <Pill>Afsluttet</Pill>}
                      {!s.active && <Pill>Ikke aktiv</Pill>}
                    </span>
                    <span className="text-sm text-muted">{course?.name}</span>
                    <span className="ml-auto w-[160px]">
                      <ProgressBar share={p.share} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">Ingen elever matcher søgningen.</p>
          )}
          <Link href="/kontor/elever" className="text-sm font-semibold text-muted hover:text-ink">
            Ryd søgning
          </Link>
        </Box>
      )}

      {!courses.length && (
        <p className="rounded-xl border border-accent-line bg-accent-bg px-3.5 py-2.5 text-sm">
          Der er ingen forløb endnu. Admin opretter dem under Indstillinger → Forløb, før elever kan oprettes.
        </p>
      )}

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

      {teams.length > 0 && (
        <section className="overflow-x-auto rounded-[20px] border border-line bg-surface" data-testid="teams">
          <table className="w-full text-left text-[15px]">
            <thead className="text-[13px] text-muted">
              <tr>
                <th className="px-[18px] py-2.5 font-semibold">Hold</th>
                <th className="px-3 py-2.5 font-semibold">Forløb</th>
                <th className="px-3 py-2.5 font-semibold">Start</th>
                <th className="px-3 py-2.5 font-semibold">Elever</th>
                <th className="w-[180px] px-3 py-2.5 font-semibold">Fremskridt</th>
                <th className="px-[18px] py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const members = students.filter((s) => s.teamId === t.id && s.active);
                const course = t.courseId ? courseById.get(t.courseId) : undefined;
                const avg = members.length
                  ? members.reduce((n, s) => n + progress(s, courseById.get(s.courseId)).share, 0) / members.length
                  : 0;
                return (
                  <tr key={t.id} className={`border-t border-line ${t.active ? "" : "bg-bg text-muted"}`} data-testid="team-row">
                    <td className="px-[18px] py-2.5">
                      <Link href={`/kontor/elever/hold/${t.id}`} className="font-bold text-ink hover:text-accent-ink hover:underline">
                        {t.name}
                      </Link>
                      {!t.active && (
                        <span className="ml-2">
                          <Pill>Afsluttet</Pill>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{course?.name ?? "–"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{t.startsOn ? formatDate(t.startsOn) : "–"}</td>
                    <td className="px-3 py-2.5">{members.length}</td>
                    <td className="px-3 py-2.5">
                      <ProgressBar share={avg} />
                    </td>
                    <td className="px-[18px] py-2 text-right">
                      <ActionForm
                        action={setTeamActive}
                        submitLabel={t.active ? "Afslut" : "Genåbn"}
                        pendingLabel="…"
                        primary={false}
                        confirmText={t.active ? `Afslut ${t.name}? Holdet kan ikke få nye elever, før det genåbnes.` : undefined}
                      >
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="active" value={String(!t.active)} />
                      </ActionForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}


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
