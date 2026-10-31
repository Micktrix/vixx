import Link from "next/link";
import { addDays, weekStart as mondayOf } from "@/lib/dates";
import type { Schedule } from "../schedule-data";
import { calendarHref } from "./params";

const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

// Måned: navne på de lærere, der har lektioner hver dag. Klik på en dag åbner dagsvisningen.
export function MonthView({ schedule, month, today }: { schedule: Schedule; month: string; today: string }) {
  const first = mondayOf(month);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d))).filter(
    (week) => week.some((d) => d.slice(0, 7) === month.slice(0, 7)),
  );
  const names = new Map(schedule.instructors.map((i) => [i.id, i.name.split(" ")[0]]));

  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
      <div className="grid min-w-[760px] grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b border-line px-2.5 py-2 text-[12px] font-semibold text-muted">
            {w}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const byInstructor = new Map<string, number>();
          for (const l of schedule.lessons.filter((l) => l.date === d)) {
            byInstructor.set(l.instructorId, (byInstructor.get(l.instructorId) ?? 0) + l.count);
          }
          const away = schedule.absences.filter((a) => a.date === d).length +
            schedule.holidays.filter((h) => h.status === "approved" && h.from <= d && d <= h.to).length;
          return (
            <Link
              key={d}
              href={calendarHref({ view: "dag", date: d })}
              className={`flex min-h-[104px] flex-col gap-0.5 border-r border-b border-line p-2 text-[12px] hover:bg-soft ${
                inMonth ? "" : "text-muted opacity-60"
              }`}
            >
              <span className={`text-[13px] font-bold ${d === today ? "text-accent-ink" : ""}`}>{Number(d.slice(8))}</span>
              {[...byInstructor].map(([id, count]) => (
                <span key={id} className="truncate">
                  {names.get(id) ?? "?"} <span className="text-muted">· {count}</span>
                </span>
              ))}
              {away > 0 && <span className="text-bad">{away} fravær/ferie</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
