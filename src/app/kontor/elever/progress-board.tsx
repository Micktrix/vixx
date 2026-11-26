import Link from "next/link";
import { FACT_TONE } from "@/components/facts-strip";
import { factText, facts, KIND_LABEL } from "@/lib/appointments";
import { formatDate } from "@/lib/dates";
import { moduleProgress, progressText } from "@/lib/module-progress";
import { progress, type CourseInfo, type StudentInfo, type EuTotals } from "./data";

// Forløbstavle: én række pr. elev og én kolonne pr. modul. Grøn = afsluttet, orange = i gang (lektioner talt),
// grå = ikke startet. Til højre faktaboksen: KTA, Mørke, Teoriprøve, Køreprøve (grå/gul/grøn).
const SHORT = { kta: "KTA", dark: "Mørke", theory_test: "Teori", driving_test: "Køre" } as const;
export function ProgressBoard({ course, students, euHours }: { course: CourseInfo; students: StudentInfo[]; euHours: Map<string, EuTotals> }) {
  // Lektionsplanen viser allerede KTA og mørke (lektion 6); så vises de ikke igen til højre.
  const factKinds = (course.lessons.length ? ["theory_test", "driving_test"] : Object.keys(SHORT)) as (keyof typeof SHORT)[];
  const anyEu = students.some((s) => s.euCourseId);
  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface" data-testid="progress-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-[18px] py-3">
        <h2 className="text-lg font-bold">{course.name}</h2>
        <span className="text-[13px] text-muted">{course.lessons.length ? "Lektion nr. øverst · grøn = kørt" : "Modul nr. øverst · grøn = afsluttet · orange = i gang"} · gul = booket</span>
      </div>
      <table className="w-full text-left text-[14px]">
        <thead className="text-[12px] text-muted">
          <tr>
            <th className="sticky left-0 bg-surface px-[18px] py-2 font-semibold">Elev</th>
            {course.lessons.length
              ? course.lessons.map((l) => (
                  <th key={l.id} className="px-1 py-2 text-center font-semibold" title={l.title}>
                    {l.kind === "kta" ? "KTA" : l.number}
                  </th>
                ))
              : course.modules.map((m) => (
                  <th key={m.id} className="px-1 py-2 text-center font-semibold" title={`Modul ${m.number} – ${m.name}`}>
                    {m.number}
                  </th>
                ))}
            <th className="px-[18px] py-2 text-right font-semibold">{course.lessons.length ? "Kørt" : "Afsluttet"}</th>
            {factKinds.map((k) => (
              <th key={k} className="px-1 py-2 text-center font-semibold">
                {SHORT[k]}
              </th>
            ))}
            {anyEu && <th className="px-2 py-2 text-center font-semibold">EU</th>}
            <th className="w-[18px]" />
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const p = progress(s, course);
            const modules = moduleProgress(course.modules, s.moduleCounts, s.moduleCompletions, course.theoryAtScan);
            return (
              <tr key={s.id} className="border-t border-line" data-testid="board-student">
                <td className="sticky left-0 bg-surface px-[18px] py-2 whitespace-nowrap">
                  <Link href={`/kontor/elever/${s.id}`} className="font-bold hover:text-accent-ink hover:underline">
                    {s.name}
                  </Link>
                </td>
                {course.lessons.length
                  ? course.lessons.map((l) => {
                      const done = s.lessonSignoffs.find((x) => x.school_lesson_id === l.id);
                      return (
                        <td key={l.id} className="px-1 py-2 text-center">
                          <span
                            data-state={done ? "done" : "missing"}
                            className={`inline-block size-5 rounded-md ${done ? "bg-ok" : "border border-line2 bg-bg"}`}
                            title={`${l.title}: ${done ? `kørt ${done.lesson_date} · ${done.instructor_name}` : "mangler"}`}
                          />
                        </td>
                      );
                    })
                  : modules.map((m) => {
                  const state = m.completed ? "done" : m.startedOn ? "started" : "missing";
                  return (
                    <td key={m.id} className="px-1 py-2 text-center">
                      <span
                        data-state={state}
                        className={`inline-block size-5 rounded-md ${state === "done" ? "bg-ok" : state === "started" ? "bg-accent" : "border border-line2 bg-bg"}`}
                        title={`Modul ${m.number}: ${m.completed ? "afsluttet" : progressText(m, course.theoryAtScan)}`}
                      />
                    </td>
                  );
                })}
                <td className="px-[18px] py-2 text-right whitespace-nowrap">
                  {course.lessons.length ? (
                    <>
                      <b>{s.lessonSignoffs.filter((x) => course.lessons.some((l) => l.id === x.school_lesson_id)).length}</b>
                      <span className="text-muted">/{course.lessons.length}</span>
                    </>
                  ) : (
                    <>
                      <b>{p.done}</b>
                      <span className="text-muted">/{p.total}</span>
                    </>
                  )}
                </td>
                {facts(modules, s.appointments).filter((f) => (factKinds as string[]).includes(f.kind)).map((f) => (
                  <td key={f.kind} className="px-1 py-2 text-center">
                    <span
                      data-testid={`board-fact-${f.kind}`}
                      data-tone={f.tone}
                      className={`inline-block rounded-md border px-1.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${FACT_TONE[f.tone]}`}
                      title={`${KIND_LABEL[f.kind]}: ${factText(f, formatDate)}`}
                    >
                      {f.tone === "done" ? "✓" : f.tone === "booked" && f.current ? shortDate(f.current.on_date) : "–"}
                    </span>
                  </td>
                ))}
                {anyEu && (
                  <td className="px-2 py-2 text-center text-[12px] whitespace-nowrap" data-testid="board-eu">
                    {s.euCourseId ? euText(s, euHours.get(s.euCourseId)) : "–"}
                  </td>
                )}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// "23/11" til tavlen.
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

// "16/138 lektioner" og "4/10 køretimer": bekræftede EU-emners faste lektioner og EU-køretimer (á 45 min.) af forløbets i alt.
function euText(s: StudentInfo, totals: EuTotals | undefined) {
  if (!totals) return "–";
  const total = [...totals.hours.values()].reduce((n, h) => n + h, 0);
  const done = s.euSignoffs.filter((x) => x.kind === "topic" && x.eu_topic_id).reduce((n, x) => n + (totals.hours.get(x.eu_topic_id!) ?? 0), 0);
  // EU-køretimerne som blokke (ØKO, Anden by, EU tur, Veksellad …): grøn = kørt.
  return (
    <>
      {done}/{total} lektioner
      {totals.driveList.length > 0 && (
        <span className="mx-auto mt-1 flex max-w-[150px] flex-wrap justify-center gap-1">
          {totals.driveList.map((d) => {
            const ok = s.euSignoffs.some((x) => x.kind === "drive" && x.eu_topic_id === d.id);
            return (
              <span
                key={d.id}
                data-testid="board-eu-drive"
                data-tone={ok ? "done" : "none"}
                title={`${d.title}: ${ok ? "kørt" : "mangler"}`}
                className={`rounded-md border px-1 py-0.5 text-[11px] font-semibold ${FACT_TONE[ok ? "done" : "none"]}`}
              >
                {driveShort(d.title)}
              </span>
            );
          })}
        </span>
      )}
    </>
  );
}

// Kort navn til tavlen: "Energirigtig kørsel (ØKO)" → "ØKO", "3 akslet" → "3-akslet".
const driveShort = (title: string) => (/energirigtig|øko/i.test(title) ? "ØKO" : title.replace("3 akslet", "3-akslet"));
