import Link from "next/link";
import { progress, type CourseInfo, type StudentInfo } from "./data";

// Forløbstavle: én række pr. elev og én kolonne pr. lektion i forløbet. Grøn = gennemført og bekræftet,
// orange = kvitteret af læreren, venter på eleven.
export function ProgressBoard({ course, students }: { course: CourseInfo; students: StudentInfo[] }) {
  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface" data-testid="progress-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-[18px] py-3">
        <h2 className="text-lg font-bold">{course.name}</h2>
        <span className="text-[13px] text-muted">Lektion nr. øverst · grøn = gennemført · orange = venter på elevens bekræftelse</span>
      </div>
      <table className="w-full text-left text-[14px]">
        <thead className="text-[12px] text-muted">
          <tr>
            <th className="sticky left-0 bg-surface px-[18px] py-2 font-semibold">Elev</th>
            {course.lessons.map((l) => (
              <th key={l.id} className="px-1 py-2 text-center font-semibold" title={`Lektion ${l.number} · ${l.count} × 45 min.`}>
                {l.number}
              </th>
            ))}
            <th className="px-[18px] py-2 text-right font-semibold">I alt</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const p = progress(s, course);
            return (
              <tr key={s.id} className="border-t border-line" data-testid="board-student">
                <td className="sticky left-0 bg-surface px-[18px] py-2 whitespace-nowrap">
                  <Link href={`/kontor/elever/${s.id}`} className="font-bold hover:text-accent-ink hover:underline">
                    {s.name}
                  </Link>
                </td>
                {course.lessons.map((l) => (
                  <td key={l.id} className="px-1 py-2 text-center">
                    <span
                      data-state={s.done.has(l.id) ? "done" : s.waiting.has(l.id) ? "waiting" : "missing"}
                      className={`inline-block size-5 rounded-md ${
                        s.done.has(l.id) ? "bg-ok" : s.waiting.has(l.id) ? "bg-accent" : "border border-line2 bg-bg"
                      }`}
                      title={`Lektion ${l.number}: ${s.done.has(l.id) ? "gennemført" : s.waiting.has(l.id) ? "venter på eleven" : "mangler"}`}
                    />
                  </td>
                ))}
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
