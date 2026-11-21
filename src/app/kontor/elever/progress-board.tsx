import Link from "next/link";
import { moduleProgress, progressText } from "@/lib/module-progress";
import { progress, type CourseInfo, type StudentInfo } from "./data";

// Forløbstavle: én række pr. elev og én kolonne pr. modul. Grøn = afsluttet, orange = i gang (lektioner talt),
// grå = ikke startet.
export function ProgressBoard({ course, students }: { course: CourseInfo; students: StudentInfo[] }) {
  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface" data-testid="progress-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-[18px] py-3">
        <h2 className="text-lg font-bold">{course.name}</h2>
        <span className="text-[13px] text-muted">Modul nr. øverst · grøn = afsluttet · orange = i gang</span>
      </div>
      <table className="w-full text-left text-[14px]">
        <thead className="text-[12px] text-muted">
          <tr>
            <th className="sticky left-0 bg-surface px-[18px] py-2 font-semibold">Elev</th>
            {course.modules.map((m) => (
              <th key={m.id} className="px-1 py-2 text-center font-semibold" title={`Modul ${m.number} – ${m.name}`}>
                {m.number}
              </th>
            ))}
            <th className="px-[18px] py-2 text-right font-semibold">Afsluttet</th>
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
                {modules.map((m) => {
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
                  <b>{p.done}</b>
                  <span className="text-muted">/{p.total}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
