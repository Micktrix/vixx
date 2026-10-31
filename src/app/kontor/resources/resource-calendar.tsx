import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { KIND_LABEL, loadBookings, loadResources, type Booking, type ResourceKind } from "@/lib/booking-data";
import { addDays, formatLongDate, formatShortDay, isWeekend, parseDateInput, todayDk, weekNumber, weekStart } from "@/lib/dates";
import { formatDuration, formatSpan, fromMinutes } from "@/lib/schedule";

const button = "inline-flex h-10 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold";
const HOURS = { from: 7 * 60, to: 21 * 60 };

export function bookingHref(p: { resource?: string; date?: string; start?: string; booking?: string }) {
  const q = new URLSearchParams();
  if (p.booking) q.set("id", p.booking);
  if (p.resource) q.set("ressource", p.resource);
  if (p.date) q.set("dato", p.date);
  if (p.start) q.set("start", p.start);
  return `/kontor/booking?${q}`;
}

const label = (b: Booking) => b.lessonLabel ?? b.title ?? "Booket";

// Kalender for lokaler eller køretøjer: dag (tidslinje pr. ressource) eller uge (ressourcer × dage).
export async function ResourceCalendar({ kind, searchParams }: { kind: ResourceKind; searchParams: Record<string, string | string[] | undefined> }) {
  const { membership } = await requireRole(["admin", "office"]);
  const today = todayDk();
  const view = searchParams.vis === "uge" ? "uge" : "dag";
  const date = parseDateInput(typeof searchParams.dato === "string" ? searchParams.dato : "") ?? today;
  const from = view === "dag" ? date : weekStart(date);
  const to = view === "dag" ? date : addDays(from, 6);

  const [resources, bookings] = await Promise.all([loadResources(membership.schoolId), loadBookings(membership.schoolId, from, to)]);
  const list = resources.filter((r) => r.kind === kind);
  const path = KIND_LABEL[kind].path;
  const href = (v: string, d: string) => `${path}?vis=${v}&dato=${d}`;
  const step = view === "dag" ? 1 : 7;

  const pos = (fromMin: number, toMin: number) => ({
    left: `${((fromMin - HOURS.from) / (HOURS.to - HOURS.from)) * 100}%`,
    width: `${((toMin - fromMin) / (HOURS.to - HOURS.from)) * 100}%`,
  });
  const hours = Array.from({ length: (HOURS.to - HOURS.from) / 60 }, (_, i) => HOURS.from + i * 60);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">{KIND_LABEL[kind].many}</h1>
        </div>
        <Link
          href={bookingHref({ date: date >= today ? date : today, resource: list[0]?.id })}
          className="inline-flex h-10 items-center rounded-[10px] border border-accent bg-accent px-3.5 text-sm font-bold text-ink"
        >
          + Book {KIND_LABEL[kind].one}
        </Link>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(view, addDays(date, -step))} aria-label="Forrige" className={button}>‹</Link>
          <Link href={href(view, today)} className={button}>I dag</Link>
          <Link href={href(view, addDays(date, step))} aria-label="Næste" className={button}>›</Link>
          <h2 className="ml-1 text-lg font-bold">
            {view === "dag" ? formatLongDate(date) : `Uge ${weekNumber(date)} · ${formatShortDay(from)} – ${formatShortDay(to)}`}
          </h2>
        </div>
        <nav aria-label="Visning" className="flex rounded-[10px] border border-line2 bg-surface p-0.5">
          {(["dag", "uge"] as const).map((v) => (
            <Link
              key={v}
              href={href(v, date)}
              aria-current={v === view ? "page" : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${v === view ? "bg-accent-bg text-accent-ink" : "text-muted"}`}
            >
              {v === "dag" ? "Dag" : "Uge"}
            </Link>
          ))}
        </nav>
      </div>

      {list.length === 0 ? (
        <p className="rounded-[20px] border border-line bg-surface px-[18px] py-4 text-muted">
          Ingen {KIND_LABEL[kind].many.toLowerCase()} endnu. De oprettes under Indstillinger.
        </p>
      ) : view === "dag" ? (
        <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
          <div className="min-w-[860px]">
            <div className="flex border-b border-line text-[12px] text-muted">
              <div className="w-[190px] shrink-0 px-[18px] py-2 font-semibold">{kind === "room" ? "Lokale" : "Køretøj"}</div>
              <div className="relative flex-1">
                {hours.map((h) => (
                  <span key={h} className="absolute top-2 -translate-x-1/2" style={{ left: pos(h, h).left }}>
                    {fromMinutes(h)}
                  </span>
                ))}
              </div>
            </div>
            {list.map((r) => {
              const own = bookings.filter((b) => b.resourceId === r.id && b.date === date);
              const used = own.reduce((n, b) => n + b.minutes, 0);
              return (
                <div key={r.id} className="flex border-b border-line last:border-b-0" data-testid="resource-row">
                  <div className="flex w-[190px] shrink-0 flex-col px-[18px] py-2.5">
                    <b>{r.name}</b>
                    <span className="text-[12px] text-muted">
                      {r.category ? `Kategori ${r.category} · ` : ""}
                      {used ? `Booket ${formatDuration(used)}` : "Ledigt hele dagen"}
                    </span>
                  </div>
                  <div className={`relative min-h-[64px] flex-1 ${date < today ? "bg-soft/60" : ""}`}>
                    {hours.map((h) => (
                      <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pos(h, h).left }} />
                    ))}
                    {date >= today &&
                      hours.map((h) => (
                        <Link
                          key={`free-${h}`}
                          href={bookingHref({ resource: r.id, date, start: fromMinutes(h) })}
                          aria-label={`Book ${r.name} kl. ${fromMinutes(h)}`}
                          className="absolute inset-y-0 opacity-0 hover:bg-accent-bg hover:opacity-100"
                          style={pos(h, h + 60)}
                        />
                      ))}
                    {own.map((b) => (
                      <Link
                        key={b.id}
                        href={bookingHref({ booking: b.id })}
                        title={`${formatSpan(b)} · ${label(b)}${b.instructorName ? ` · ${b.instructorName}` : ""}`}
                        className="absolute inset-y-2 overflow-hidden rounded-lg border border-accent-line bg-accent-bg px-2 py-1 text-[12px] leading-tight hover:border-accent"
                        style={pos(b.from, b.to)}
                        data-testid="booking-block"
                      >
                        <b className="block truncate">{formatSpan(b)}</b>
                        <span className="block truncate text-muted">
                          {label(b)}
                          {b.instructorName ? ` · ${b.instructorName}` : ""}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
          <table className="w-full min-w-[900px] table-fixed text-left text-[13px]">
            <thead>
              <tr className="text-[12px] text-muted">
                <th className="w-[170px] px-3 py-2.5 pl-[18px] font-semibold">{kind === "room" ? "Lokale" : "Køretøj"}</th>
                {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                  <th key={d} className={`px-2 py-2.5 font-semibold ${d === today ? "text-accent-ink" : ""} ${isWeekend(d) ? "w-[90px]" : ""}`}>
                    <Link href={href("dag", d)} className="hover:underline">
                      {formatShortDay(d)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <th className="px-3 py-2.5 pl-[18px] font-bold">{r.name}</th>
                  {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                    <td key={d} className={`px-1.5 py-1.5 ${d < today ? "bg-soft/60" : ""}`}>
                      <div className="flex flex-col gap-1">
                        {bookings
                          .filter((b) => b.resourceId === r.id && b.date === d)
                          .map((b) => (
                            <Link key={b.id} href={bookingHref({ booking: b.id })} className="rounded-md border border-accent-line bg-accent-bg px-1.5 py-1 hover:border-accent">
                              <b>{b.start}</b> {label(b)}
                            </Link>
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
