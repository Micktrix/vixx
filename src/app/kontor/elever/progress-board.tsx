import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { FACT_TONE } from "@/components/facts-strip";
import { euTestKinds, factText, facts, KIND_LABEL } from "@/lib/appointments";
import { formatDate } from "@/lib/dates";
import { moduleProgress, progressText } from "@/lib/module-progress";
import { progress, type CourseInfo, type StudentInfo, type EuTotals } from "./data";

// Forløbstavle: én række pr. elev og én kolonne pr. modul. Grøn = afsluttet, orange = i gang (lektioner talt),
// grå = ikke startet. Til højre faktaboksen: KTA, Mørke, Teoriprøve, Køreprøve (grå/gul/grøn).
const SHORT = { kta: "KTA", dark: "Mørke", theory_test: "Teori", driving_test: "Køre" } as const;
export function ProgressBoard({ course, students, euHours }: { course: CourseInfo; students: StudentInfo[]; euHours: Map<string, EuTotals> }) {
  const factKinds = Object.keys(SHORT) as (keyof typeof SHORT)[];
  const span = (course.lessons.length || course.modules.length) + 6; // alle kolonner efter elevens navn
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
            <th className="w-[18px]" />
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const p = progress(s, course);
            const modules = moduleProgress(course.modules, s.moduleCounts, s.moduleCompletions, course.theoryAtScan);
            const eu = s.euCourseId ? euHours.get(s.euCourseId) : undefined;
            return (
              <Fragment key={s.id}>
              <tr className="border-t border-line" data-testid="board-student">
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
                <td />
              </tr>
              {eu && (
                // EU på sin egen linje under kørekortet (Michael 26. nov. 2026).
                <tr data-testid="board-eu" data-student={s.name}>
                  <td className="sticky left-0 bg-surface px-[18px] pb-3 align-bottom text-[12px] font-semibold text-muted">EU</td>
                  <td colSpan={span} className="px-1 pb-3">
                    <EuLine s={s} totals={eu} modules={modules} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// "23/11" til tavlen.
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

// EU-linjen: forløbets navn, emnernes lektioner, køretimerne som blokke (ØKO, Anden by, EU tur, Veksellad …) og
// prøverne (Lastsikring, Multitest). Grøn = kørt/bestået, gul = booket.
// Som kørekortlinjen: overskrift øverst og faktaboks under.
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </span>
  );
}

function EuLine({ s, totals, modules }: { s: StudentInfo; totals: EuTotals; modules: ReturnType<typeof moduleProgress> }) {
  const total = [...totals.hours.values()].reduce((n, h) => n + h, 0);
  const done = s.euSignoffs.filter((x) => x.kind === "topic" && x.eu_topic_id).reduce((n, x) => n + (totals.hours.get(x.eu_topic_id!) ?? 0), 0);
  const tests = facts(modules, s.appointments, euTestKinds(totals.kind)).filter((f) => f.kind === "lastsikring" || f.kind === "multitest");
  const box = "inline-block min-w-[28px] rounded-md border px-1.5 py-0.5 text-center text-[12px] font-semibold whitespace-nowrap";
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <Cell label={totals.name}>
        <span className={`${box} ${FACT_TONE[done >= total && total > 0 ? "done" : "none"]}`} data-testid="board-eu-lessons">
          {done}/{total} lekt.
        </span>
      </Cell>
      {totals.driveList.map((d) => {
        const ok = s.euSignoffs.some((x) => x.kind === "drive" && x.eu_topic_id === d.id);
        return (
          <Cell key={d.id} label={driveShort(d.title)}>
            <span data-testid="board-eu-drive" data-label={driveShort(d.title)} data-tone={ok ? "done" : "none"} title={`${d.title}: ${ok ? "kørt" : "mangler"}`} className={`${box} ${FACT_TONE[ok ? "done" : "none"]}`}>
              {ok ? "✓" : "–"}
            </span>
          </Cell>
        );
      })}
      {tests.map((f) => (
        <Cell key={f.kind} label={KIND_LABEL[f.kind]}>
          <span data-testid={`board-fact-${f.kind}`} data-tone={f.tone} title={`${KIND_LABEL[f.kind]}: ${factText(f, formatDate)}`} className={`${box} ${FACT_TONE[f.tone]}`}>
            {f.tone === "done" ? "✓" : f.tone === "booked" && f.current ? shortDate(f.current.on_date) : "–"}
          </span>
        </Cell>
      ))}
    </div>
  );
}

// Kort navn til tavlen: "Energirigtig kørsel (ØKO)" → "ØKO", "3 akslet" → "3-akslet".
const driveShort = (title: string) => (/energirigtig|øko/i.test(title) ? "ØKO" : title.replace("3 akslet", "3-akslet"));
