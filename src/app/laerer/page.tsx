import Link from "next/link";
import { formatDate, isWeekend, parseDateInput, todayDk, weekdayIndex } from "@/lib/dates";
import { daysIn, nextPeriod, periodFor, previousPeriod } from "@/lib/pay-period";
import { DayPanel } from "./day-panel";
import { Screen } from "./screen";
import { getTeacher, loadTeacherPeriod, type TeacherPeriod } from "./teacher-data";

const WEEKDAYS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];
const dot = { pending: "bg-pend", approved: "bg-ok", rejected: "bg-bad" } as const;
const navButton = "inline-flex size-[42px] items-center justify-center rounded-xl border border-line bg-surface text-lg";

// Dage i perioden, hvor der var planlagt noget, men intet er registreret (og ingen godkendt ferie).
function missingDays(period: TeacherPeriod, days: string[], today: string) {
  return days.filter(
    (d) =>
      d < today &&
      period.lessons.some((l) => l.date === d) &&
      !period.registrations.some((r) => r.date === d) &&
      !period.holidays.some((h) => h.status === "approved" && h.from <= d && d <= h.to),
  );
}

export default async function InstructorCalendarPage({ searchParams }: PageProps<"/laerer">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const today = todayDk();
  const selected = parseDateInput(typeof sp.dag === "string" ? sp.dag : "") ?? today;
  const range = periodFor(selected, teacher.periodStartDay);
  const days = daysIn(range);
  const period = await loadTeacherPeriod(teacher, range.start, range.end);
  const missing = missingDays(period, days, today);

  const pick = (p: { start: string; end: string }) => (p.start <= today && today <= p.end ? today : p.start);
  const nav = (
    <span className="flex gap-2">
      <Link href={`/laerer?dag=${pick(previousPeriod(range, teacher.periodStartDay))}`} aria-label="Forrige lønperiode" className={navButton}>
        ‹
      </Link>
      <Link href={`/laerer?dag=${pick(nextPeriod(range, teacher.periodStartDay))}`} aria-label="Næste lønperiode" className={navButton}>
        ›
      </Link>
    </span>
  );

  return (
    <Screen title="Kalender" sub={`Hej ${teacher.user.fullName.split(" ")[0]}`} action={nav}>
      {missing.length > 0 && (
        <section className="flex flex-col gap-2 rounded-[16px] border border-bad/30 bg-bad-bg px-4 py-3">
          <b className="text-bad">Du mangler at registrere {missing.length === 1 ? "1 dag" : `${missing.length} dage`}</b>
          <span className="flex flex-wrap gap-1.5">
            {missing.map((d) => (
              <Link key={d} href={`/laerer?dag=${d}`} className="rounded-full border border-bad/30 bg-surface px-2.5 py-1 text-[13px] font-semibold">
                {formatDate(d)}
              </Link>
            ))}
          </span>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-center text-sm font-semibold text-muted">
          {formatDate(range.start)} – {formatDate(range.end)}
          {period.locked.some((p) => p.from <= range.start && range.end <= p.to) ? " (låst)" : ""}
        </p>
        <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-muted">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: weekdayIndex(range.start) }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d) => {
            const regs = period.registrations.filter((r) => r.date === d);
            const registered = regs.filter((r) => r.status !== "rejected").reduce((n, r) => n + r.count, 0);
            const planned = period.lessons.filter((l) => l.date === d).reduce((n, l) => n + l.count, 0);
            const holiday = period.holidays.find((h) => h.from <= d && d <= h.to);
            const absent = period.absences.some((a) => a.date === d);
            const canWork = period.canWork.some((c) => c.date === d);
            const isMissing = missing.includes(d);
            const label = absent && !planned && !regs.length
              ? "Fravær"
              : holiday
                ? holiday.status === "approved" ? "Ferie" : "Ferie?"
                : regs.length
                  ? `${registered} lek.`
                  : planned
                    ? `${planned} plan.`
                    : "";
            return (
              <Link
                key={d}
                href={`/laerer?dag=${d}`}
                aria-label={`${formatDate(d)}${regs.length ? `, ${registered} lektioner registreret` : ""}`}
                aria-current={d === selected ? "date" : undefined}
                className={[
                  "flex h-[58px] flex-col items-center justify-start gap-0.5 rounded-xl border pt-1.5 text-[15px]",
                  d === selected ? "border-accent bg-accent-bg" : isMissing ? "border-bad/40 bg-bad-bg" : "border-line bg-surface",
                  isWeekend(d) && d !== selected ? "text-muted" : "",
                  d === today ? "font-bold" : "",
                  canWork && d !== selected ? "ring-2 ring-ok/40 ring-inset" : "",
                ].join(" ")}
              >
                <span>{Number(d.slice(8))}</span>
                <span className={`text-[10.5px] leading-none ${absent || holiday ? "text-muted" : "text-accent-ink"}`}>{label}</span>
                <span className="flex gap-0.5">
                  {regs.map((r) => (
                    <i key={r.id} className={`size-1.5 rounded-full ${dot[r.status]}`} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-ok" />Godkendt</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-pend" />Afventer</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-bad" />Afvist</span>
        </p>
      </section>

      <DayPanel teacher={teacher} period={period} date={selected} today={today} />
    </Screen>
  );
}
