import Link from "next/link";
import { Pill } from "@/components/pill";
import { addDays, formatShortDay, isWeekend } from "@/lib/dates";
import { formatSpan } from "@/lib/schedule";
import { dayInfo, REASON_LABEL, type Schedule } from "../schedule-data";
import { calendarHref, planHref } from "./params";

// Uge: lærere × dage. Hver celle viser dagens lektioner og fravær; klik på dagen åbner dagsvisningen.
export function WeekView({ schedule, weekStart, today }: { schedule: Schedule; weekStart: string; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
      <table className="w-full min-w-[980px] table-fixed text-left text-[13px]">
        <colgroup>
          <col className="w-[170px]" />
          {days.map((d) => (
            <col key={d} className={isWeekend(d) ? "w-[90px]" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="text-[12px] text-muted">
            <th className="px-3 py-2.5 pl-[18px] font-semibold">Underviser</th>
            {days.map((d) => (
              <th key={d} className={`px-2 py-2.5 font-semibold ${d === today ? "text-accent-ink" : ""}`}>
                <Link href={calendarHref({ view: "dag", date: d })} className="hover:underline">
                  {formatShortDay(d)}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedule.instructors.map((instructor) => {
            const weekLessons = schedule.lessons.filter((l) => l.instructorId === instructor.id);
            const total = weekLessons.reduce((n, l) => n + l.count, 0);
            return (
              <tr key={instructor.id} className="border-t border-line align-top">
                <th className="px-3 py-2.5 pl-[18px] font-normal">
                  <b className="block truncate text-[14px]">{instructor.name}</b>
                  <span className="text-muted">{total ? `${total} lek.` : "Intet planlagt"}</span>
                  {instructor.isGuest && (
                    <span className="mt-1 block">
                      <Pill>Gæst</Pill>
                    </span>
                  )}
                </th>
                {days.map((d) => {
                  const day = dayInfo(schedule, instructor, d);
                  const lessons = weekLessons.filter((l) => l.date === d);
                  const absences = schedule.absences.filter((a) => a.instructorId === instructor.id && a.date === d);
                  return (
                    <td key={d} className={`px-1.5 py-1.5 ${d < today ? "bg-soft/60" : ""}`}>
                      <div className="flex flex-col gap-1">
                        {day.holiday === "approved" && <span className="rounded-md bg-soft px-1.5 py-1 font-bold text-muted">Ferie</span>}
                        {day.holiday === "pending" && <span className="text-[11px] font-semibold text-accent-ink">Ferie anmodet</span>}
                        {absences.map((a) => (
                          <span key={a.id} className="rounded-md bg-bad-bg px-1.5 py-1 text-bad">
                            {REASON_LABEL[a.reason]} {formatSpan(a)}
                          </span>
                        ))}
                        {lessons.map((l) => (
                          <Link
                            key={l.id}
                            href={planHref({ lesson: l.id })}
                            className="rounded-md border border-accent-line bg-accent-bg px-1.5 py-1 hover:border-accent"
                          >
                            <b>{l.start}</b> {l.serviceName} · {l.count}
                          </Link>
                        ))}
                        {instructor.onRequest &&
                          day.canWork.map((c, i) => (
                            <span key={i} className="rounded-md bg-ok-bg px-1.5 py-1 text-ok">
                              Kan {formatSpan(c)}
                            </span>
                          ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
