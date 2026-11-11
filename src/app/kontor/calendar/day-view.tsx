import Link from "next/link";
import { Pill } from "@/components/pill";
import { formatSpan, fromMinutes, type Span } from "@/lib/schedule";
import { dayInfo, REASON_LABEL, type Schedule } from "../schedule-data";
import { absenceHref, planHref } from "./params";

// Dag: lærere i rækker med en tidslinje, som i prototypen.
export function DayView({ schedule, date, past }: { schedule: Schedule; date: string; past: boolean }) {
  const items = [
    ...schedule.lessons.filter((l) => l.date === date),
    ...schedule.absences.filter((a) => a.date === date),
    ...schedule.bookings.filter((b) => b.date === date),
  ];
  // Tidslinjen viser 07–18 og udvides, hvis noget ligger uden for.
  const start = Math.min(7 * 60, ...items.map((i) => Math.floor(i.from / 60) * 60));
  const end = Math.max(18 * 60, ...items.map((i) => Math.ceil(i.to / 60) * 60));
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60);
  const pos = (s: Span) => ({
    left: `${((s.from - start) / (end - start)) * 100}%`,
    width: `${((s.to - s.from) / (end - start)) * 100}%`,
  });

  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
      <div className="min-w-[860px]">
        <div className="flex border-b border-line text-[12px] text-muted">
          <div className="w-[210px] shrink-0 px-[18px] py-2 font-semibold">Underviser</div>
          <div className="relative flex-1">
            {hours.map((h) => (
              <span key={h} className="absolute top-2 -translate-x-1/2" style={{ left: pos({ from: h, to: h }).left }}>
                {fromMinutes(h)}
              </span>
            ))}
          </div>
        </div>

        {schedule.instructors.map((instructor) => {
          const day = dayInfo(schedule, instructor, date);
          const lessons = schedule.lessons.filter((l) => l.instructorId === instructor.id && l.date === date);
          const absences = schedule.absences.filter((a) => a.instructorId === instructor.id && a.date === date);
          const bookings = schedule.bookings.filter((b) => b.instructorId === instructor.id && b.date === date);
          const lessonCount = lessons.reduce((n, l) => n + l.count, 0);
          return (
            <div key={instructor.id} className="flex border-b border-line last:border-b-0" data-testid="day-row">
              <div className="flex w-[210px] shrink-0 flex-col gap-1 px-[18px] py-2.5">
                <span className="flex items-center gap-1.5">
                  <b className="truncate">{instructor.name}</b>
                  {instructor.isGuest && <Pill>Gæst</Pill>}
                </span>
                <span className="text-[12px] text-muted">
                  {lessonCount ? `${lessonCount} lek.` : "Intet planlagt"}
                </span>
                <span className="flex flex-wrap gap-1">
                  {instructor.onRequest && <Pill tone="accent">Efter aftale</Pill>}
                  {day.holiday === "pending" && <Pill tone="accent">Ferie anmodet</Pill>}
                </span>
                {!past && day.holiday !== "approved" && (
                  <span className="flex gap-2 text-[12px] font-semibold">
                    <Link href={planHref({ instructor: instructor.id, date })} className="text-accent-ink hover:underline">
                      + Lektion
                    </Link>
                    <Link href={absenceHref({ instructor: instructor.id, date })} className="text-muted hover:underline">
                      + Fravær
                    </Link>
                  </span>
                )}
              </div>
              <div
                className={`relative min-h-[76px] flex-1 ${past ? "bg-soft/60" : ""} ${
                  day.holiday === "approved" ? "bg-[repeating-linear-gradient(135deg,var(--color-soft)_0_8px,transparent_8px_16px)]" : ""
                }`}
              >
                {hours.map((h) => (
                  <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pos({ from: h, to: h }).left }} />
                ))}
                {day.holiday === "approved" && (
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 font-bold text-muted">Ferie</span>
                )}
                {instructor.onRequest &&
                  day.canWork.map((c, i) => (
                    <span
                      key={i}
                      title={`Kan arbejde ${formatSpan(c)}`}
                      className="absolute inset-y-1 rounded-md bg-ok-bg"
                      style={pos(c)}
                    />
                  ))}
                {absences.map((a) => (
                  <Link
                    key={a.id}
                    href={absenceHref({ absence: a.id })}
                    title={`${REASON_LABEL[a.reason]} ${formatSpan(a)}${a.note ? ` – ${a.note}` : ""}`}
                    className="absolute inset-y-2 overflow-hidden rounded-lg border border-bad/30 bg-bad-bg px-2 py-1 text-[12px] text-bad"
                    style={pos(a)}
                  >
                    <b>{REASON_LABEL[a.reason]}</b> {formatSpan(a)}
                  </Link>
                ))}
                {bookings.map((b) => (
                  <Link
                    key={b.id}
                    href={`/kontor/booking?id=${b.id}`}
                    title={`${b.title} · ${b.resourceName} ${formatSpan(b)}`}
                    className="absolute inset-y-2 overflow-hidden rounded-lg border border-line2 bg-soft px-2 py-1 text-[12px] leading-tight hover:border-ink/40"
                    style={pos(b)}
                    data-testid="booking-block"
                  >
                    <b className="block truncate">{b.title}</b>
                    <span className="block truncate text-muted">
                      {formatSpan(b)}
                      {b.title !== b.resourceName ? ` · ${b.resourceName}` : ""}
                    </span>
                  </Link>
                ))}
                {lessons.map((l) => (
                  <Link
                    key={l.id}
                    href={planHref({ lesson: l.id })}
                    title={`${formatSpan(l)} ${l.serviceName} · ${l.count} lek.${l.studentName ? ` · ${l.studentName}` : ""}`}
                    className="absolute inset-y-2 overflow-hidden rounded-lg border border-accent-line bg-accent-bg px-2 py-1 text-[12px] leading-tight hover:border-accent"
                    style={pos(l)}
                    data-testid="lesson-block"
                  >
                    <b className="block truncate">{l.serviceName}</b>
                    <span className="block truncate text-muted">
                      {formatSpan(l)} · {l.count} lek.
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {schedule.instructors.length === 0 && <p className="px-[18px] py-4 text-muted">Ingen undervisere.</p>}
      </div>
    </section>
  );
}
