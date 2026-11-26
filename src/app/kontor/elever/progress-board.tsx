import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { FACT_TONE } from "@/components/facts-strip";
import { euTestKinds, factText, facts, KIND_LABEL } from "@/lib/appointments";
import { formatDate } from "@/lib/dates";
import { moduleProgress, progressText } from "@/lib/module-progress";
import { progress, type CourseInfo, type StudentInfo, type EuTotals } from "./data";

// Forløbstavle: én række pr. elev med elevens egne overskrifter over boksene (Michael 26. nov. 2026): lektionerne
// 1–9 (lektionsplanen) eller modulerne (B), "Kørt"/"Afsluttet", og faktaboksen KTA, Mørke, Teori, Køre (grå/gul/grøn).
// Har eleven EU, står EU på en linje under. Grøn = kørt/afsluttet/bestået, orange = modul i gang, gul = booket.
const SHORT = { kta: "KTA", dark: "Mørke", theory_test: "Teori", driving_test: "Køre" } as const;
// Samme felt som faktaboksen: ✓ (grøn), "…" (gul, modul i gang) eller "–" (grå).
const box = "inline-block min-w-[28px] rounded-md border px-1.5 py-0.5 text-center text-[12px] font-semibold whitespace-nowrap";
export function ProgressBoard({ course, students, euHours }: { course: CourseInfo; students: StudentInfo[]; euHours: Map<string, EuTotals> }) {
  // KTA står i faktaboksen (grøn, når KTA-lektionen er kørt eller KTA er markeret), ikke i lektionsrækken.
  const lessons = course.lessons.filter((l) => l.kind !== "kta");
  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface" data-testid="progress-board">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-[18px] py-3">
        <h2 className="text-lg font-bold">{course.name}</h2>
        <span className="text-[13px] text-muted">
          {course.lessons.length ? "✓ = kørt · gul = booket" : "✓ = afsluttet · … = i gang · gul = booket"}
        </span>
      </div>
      <table className="w-full text-left text-[14px]">
        <tbody>
          {students.map((s) => {
            const p = progress(s, course);
            const modules = moduleProgress(course.modules, s.moduleCounts, s.moduleCompletions, course.theoryAtScan);
            const eu = s.euCourseId ? euHours.get(s.euCourseId) : undefined;
            return (
              <Fragment key={s.id}>
                <tr className="border-t border-line" data-testid="board-student">
                  <td className="sticky left-0 w-[1%] bg-surface px-[18px] py-3 align-bottom whitespace-nowrap">
                    <Link href={`/kontor/elever/${s.id}`} className="font-bold hover:text-accent-ink hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-[18px] pl-1">
                    <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-2">
                      {lessons.length
                        ? lessons.map((l) => {
                            const done = s.lessonSignoffs.find((x) => x.school_lesson_id === l.id);
                            return (
                              <Cell key={l.id} label={String(l.number)}>
                                <span
                                  data-state={done ? "done" : "missing"}
                                  className={`${box} ${FACT_TONE[done ? "done" : "none"]}`}
                                  title={`${l.title}: ${done ? `kørt ${done.lesson_date} · ${done.instructor_name}` : "mangler"}`}
                                >
                                  {done ? "✓" : "–"}
                                </span>
                              </Cell>
                            );
                          })
                        : modules.map((m) => {
                            const state = m.completed ? "done" : m.startedOn ? "started" : "missing";
                            return (
                              <Cell key={m.id} label={`M${m.number}`}>
                                <span
                                  data-state={state}
                                  className={`${box} ${FACT_TONE[state === "done" ? "done" : state === "started" ? "booked" : "none"]}`}
                                  title={`Modul ${m.number}: ${m.completed ? "afsluttet" : progressText(m, course.theoryAtScan)}`}
                                >
                                  {state === "done" ? "✓" : state === "started" ? "…" : "–"}
                                </span>
                              </Cell>
                            );
                          })}
                      <Cell label={lessons.length ? "Kørt" : "Afsluttet"}>
                        <span className="text-[14px]" data-testid="board-done">
                          {lessons.length ? (
                            <>
                              <b>{s.lessonSignoffs.filter((x) => lessons.some((l) => l.id === x.school_lesson_id)).length}</b>
                              <span className="text-muted">/{lessons.length}</span>
                            </>
                          ) : (
                            <>
                              <b>{p.done}</b>
                              <span className="text-muted">/{p.total}</span>
                            </>
                          )}
                        </span>
                      </Cell>
                      {facts(modules, s.appointments).map((f) => (
                        <Cell key={f.kind} label={SHORT[f.kind as keyof typeof SHORT] ?? KIND_LABEL[f.kind]}>
                          <span
                            data-testid={`board-fact-${f.kind}`}
                            data-tone={f.tone}
                            className={`inline-block min-w-[28px] rounded-md border px-1.5 py-0.5 text-center text-[12px] font-semibold whitespace-nowrap ${FACT_TONE[f.tone]}`}
                            title={`${KIND_LABEL[f.kind]}: ${factText(f, formatDate)}`}
                          >
                            {f.tone === "done" ? "✓" : f.tone === "booked" && f.current ? shortDate(f.current.on_date) : "–"}
                          </span>
                        </Cell>
                      ))}
                    </div>
                  </td>
                </tr>
                {eu && (
                  // EU på sin egen linje under kørekortet.
                  <tr data-testid="board-eu" data-student={s.name}>
                    <td className="sticky left-0 bg-surface px-[18px] pb-3 align-bottom text-[12px] font-semibold text-muted">EU</td>
                    <td className="pb-3 pr-[18px] pl-1">
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
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
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
