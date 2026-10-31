import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import {
  addDays,
  addMonths,
  formatLongDate,
  formatMonth,
  formatShortDay,
  monthStart,
  todayDk,
  weekNumber,
  weekStart,
} from "@/lib/dates";
import { DayView } from "./calendar/day-view";
import { InstructorFilter } from "./calendar/instructor-filter";
import { MonthView } from "./calendar/month-view";
import { calendarHref, planHref, readParams, type View } from "./calendar/params";
import { WeekView } from "./calendar/week-view";
import { loadSchedule } from "./schedule-data";

const VIEWS: { view: View; label: string }[] = [
  { view: "dag", label: "Dag" },
  { view: "uge", label: "Uge" },
  { view: "maaned", label: "Måned" },
];

const button = "inline-flex h-10 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold";

export default async function OfficeCalendarPage({ searchParams }: PageProps<"/kontor">) {
  const { membership } = await requireRole(["admin", "office"]);
  const params = readParams(await searchParams);
  const today = todayDk();
  const { view, date, instructor } = params;

  const from = view === "dag" ? date : view === "uge" ? weekStart(date) : weekStart(monthStart(date));
  const to = view === "dag" ? date : view === "uge" ? addDays(from, 6) : addDays(from, 41);
  const step = (n: number) =>
    view === "dag" ? addDays(date, n) : view === "uge" ? addDays(date, 7 * n) : addMonths(date, n);

  const all = await loadSchedule(membership.schoolId, from, to);
  const schedule = instructor ? { ...all, instructors: all.instructors.filter((i) => i.id === instructor) } : all;

  const title =
    view === "dag"
      ? formatLongDate(date)
      : view === "uge"
        ? `Uge ${weekNumber(date)} · ${formatShortDay(from)} – ${formatShortDay(to)}`
        : formatMonth(date);

  const hrefFor = Object.fromEntries(
    ["", ...all.instructors.map((i) => i.id)].map((id) => [id, calendarHref({ view, date, instructor: id || null })]),
  );

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Kalender</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InstructorFilter instructors={all.instructors} value={instructor} hrefFor={hrefFor} />
          <Link href={`/kontor/find?dato=${date}`} className={button}>
            Find ledig underviser
          </Link>
          <Link
            href={planHref({ instructor: instructor ?? undefined, date: date >= today ? date : today })}
            className="inline-flex h-10 items-center rounded-[10px] border border-accent bg-accent px-3.5 text-sm font-bold text-ink"
          >
            + Planlæg
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={calendarHref({ ...params, date: step(-1) })} aria-label="Forrige" className={button}>
            ‹
          </Link>
          <Link href={calendarHref({ ...params, date: today })} className={button}>
            I dag
          </Link>
          <Link href={calendarHref({ ...params, date: step(1) })} aria-label="Næste" className={button}>
            ›
          </Link>
          <h2 className="ml-1 text-lg font-bold">{title}</h2>
        </div>
        <nav aria-label="Visning" className="flex rounded-[10px] border border-line2 bg-surface p-0.5">
          {VIEWS.map((v) => (
            <Link
              key={v.view}
              href={calendarHref({ ...params, view: v.view })}
              aria-current={v.view === view ? "page" : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${
                v.view === view ? "bg-accent-bg text-accent-ink" : "text-muted"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      {view === "dag" && <DayView schedule={schedule} date={date} past={date < today} />}
      {view === "uge" && <WeekView schedule={schedule} weekStart={from} today={today} />}
      {view === "maaned" && <MonthView schedule={schedule} month={date} today={today} />}
    </>
  );
}
