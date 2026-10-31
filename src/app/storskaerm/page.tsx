import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";
import { requireRole } from "@/lib/auth/session";
import { loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, todayDk } from "@/lib/dates";
import { nowMinutesDk, resourceNow, teacherNow } from "@/lib/now-status";
import { formatSpan, fromMinutes, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { dayInfo, loadSchedule } from "../kontor/schedule-data";
import { LiveClock, NowLine } from "./live";

export const metadata = { title: "Storskærm · Vixx" };

const until = (m: number | null) => (m === null ? "resten af dagen" : `til ${fromMinutes(m)}`);

// Dagens overblik til en skærm på kontoret: hvem og hvad er optaget og ledigt lige nu.
// Siden henter nye data hvert minut (LiveClock). Viser aldrig elevnavne.
export default async function DashboardPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const today = todayDk();
  const now = nowMinutesDk();
  const supabase = await createClient();

  const [schedule, resources, bookings, { count: pending }] = await Promise.all([
    loadSchedule(membership.schoolId, today, today),
    loadResources(membership.schoolId),
    loadBookings(membership.schoolId, today, today),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("school_id", membership.schoolId).eq("status", "pending"),
  ]);
  const lessons = schedule.lessons;

  // Lige nu: lærere.
  const teachers = schedule.instructors.map((i) => {
    const day = dayInfo(schedule, i, today);
    const lessonNow = lessons.find((l) => l.instructorId === i.id && l.from <= now && now < l.to);
    return { instructor: i, day, status: teacherNow(day, now), lessonNow };
  });
  const busyTeachers = teachers.filter((t) => t.status.state === "busy");
  const freeTeachers = teachers.filter((t) => t.status.state === "free");
  const awayTeachers = teachers.filter((t) => t.status.state === "away");

  // Lige nu: lokaler og køretøjer.
  const resourceStatus = resources.map((r) => {
    const own = bookings.filter((b) => b.resourceId === r.id);
    return { resource: r, own, status: resourceNow(own, now), bookingNow: own.find((b) => b.from <= now && now < b.to) };
  });
  const busyResources = resourceStatus.filter((r) => r.status.state === "busy");
  const freeResources = resourceStatus.filter((r) => r.status.state === "free");

  // Fælles tidslinje 07–18, udvidet hvis noget ligger uden for.
  const items: Span[] = [...lessons, ...schedule.absences, ...bookings];
  const from = Math.min(7 * 60, ...items.map((i) => Math.floor(i.from / 60) * 60));
  const to = Math.max(18 * 60, ...items.map((i) => Math.ceil(i.to / 60) * 60));
  const pos = (s: Span) => ({ left: `${((s.from - from) / (to - from)) * 100}%`, width: `${((s.to - s.from) / (to - from)) * 100}%` });
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const teacherRows = teachers.filter((t) => lessons.some((l) => l.instructorId === t.instructor.id) || t.status.state === "away");

  const timelineHeader = (title: string) => (
    <div className="flex border-b border-line text-[13px] text-muted">
      <div className="w-[200px] shrink-0 px-5 py-2.5 font-semibold">{title}</div>
      <div className="relative flex-1">
        {hours.map((h) => (
          <span key={h} className="absolute top-2.5 -translate-x-1/2" style={{ left: pos({ from: h, to: h }).left }}>
            {fromMinutes(h)}
          </span>
        ))}
      </div>
    </div>
  );
  const gridLines = (
    <>
      {hours.map((h) => (
        <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pos({ from: h, to: h }).left }} />
      ))}
      <NowLine from={from} to={to} />
    </>
  );

  return (
    <main className="flex min-h-dvh flex-col gap-5 bg-bg p-[clamp(16px,2.5vw,36px)]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-muted">{membership.schoolName}</p>
            <h1 className="text-[clamp(24px,2.6vw,40px)] font-bold">{formatLongDate(today)}</h1>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <b className="text-[clamp(28px,3.4vw,52px)]">
            <LiveClock />
          </b>
          <Link href="/kontor" className="text-sm font-semibold text-muted hover:text-ink">
            ‹ Kontor
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="lektioner i dag" value={lessons.reduce((n, l) => n + l.count, 0)} />
        <Kpi label="undervisere i dag" value={teachers.filter((t) => lessons.some((l) => l.instructorId === t.instructor.id)).length} />
        <Kpi label="fravær / ferie" value={awayTeachers.length} />
        <Kpi label="afventer godkendelse" value={pending ?? 0} warn={(pending ?? 0) > 0} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Lige nu">
        <Panel title="Undervisere lige nu">
          <Group title="Optaget" tone="busy" count={busyTeachers.length} testId="teachers-busy">
            {busyTeachers.map((t) => (
              <Item key={t.instructor.id} name={t.instructor.name}>
                {t.lessonNow?.serviceName} · {t.status.state === "busy" && until(t.status.until)}
              </Item>
            ))}
          </Group>
          <Group title="Ledige" tone="free" count={freeTeachers.length} testId="teachers-free">
            {freeTeachers.map((t) => (
              <Item key={t.instructor.id} name={t.instructor.name}>
                {t.status.state === "free" && `ledig ${until(t.status.until)}`}
              </Item>
            ))}
          </Group>
          {awayTeachers.length > 0 && (
            <Group title="Fravær og ferie" tone="away" count={awayTeachers.length} testId="teachers-away">
              {awayTeachers.map((t) => (
                <Item key={t.instructor.id} name={t.instructor.name}>
                  {t.status.state === "away" && `${t.status.reason} ${until(t.status.until)}`}
                </Item>
              ))}
            </Group>
          )}
        </Panel>

        <Panel title="Lokaler og køretøjer lige nu">
          <Group title="Optaget" tone="busy" count={busyResources.length} testId="resources-busy">
            {busyResources.map((r) => (
              <Item key={r.resource.id} name={r.resource.name}>
                {r.bookingNow?.instructorName ?? r.bookingNow?.title ?? "Kontoret"} · {r.status.state === "busy" && until(r.status.until)}
              </Item>
            ))}
          </Group>
          <Group title="Ledige" tone="free" count={freeResources.length} testId="resources-free">
            {freeResources.map((r) => (
              <Item key={r.resource.id} name={r.resource.name}>
                {r.resource.kind === "room" ? "Lokale" : `Køretøj${r.resource.category ? ` ${r.resource.category}` : ""}`} ·{" "}
                {r.status.state === "free" && `ledig ${until(r.status.until)}`}
              </Item>
            ))}
          </Group>
        </Panel>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        {timelineHeader("Underviser")}
        {teacherRows.map(({ instructor, day }) => {
          const own = lessons.filter((l) => l.instructorId === instructor.id);
          return (
            <div key={instructor.id} className="flex border-b border-line last:border-b-0" data-testid="dashboard-row">
              <div className="flex w-[200px] shrink-0 flex-col justify-center px-5 py-3">
                <b className="truncate text-[17px]">{instructor.name}</b>
                <span className="text-[13px] text-muted">
                  {own.length ? `${own.reduce((n, l) => n + l.count, 0)} lek.` : day.holiday === "approved" ? "Ferie" : "Fravær"}
                </span>
              </div>
              <div className="relative min-h-[60px] flex-1">
                {gridLines}
                {day.absences.map((a, k) => (
                  <span key={k} className="absolute inset-y-2 rounded-lg bg-bad-bg px-2 py-1 text-[13px] text-bad" style={pos(a)}>
                    Fravær {formatSpan(a)}
                  </span>
                ))}
                {own.map((l) => (
                  <span
                    key={l.id}
                    className="absolute inset-y-2 overflow-hidden rounded-lg border border-accent-line bg-accent-bg px-2 py-1 text-[13px] leading-tight"
                    style={pos(l)}
                  >
                    <b className="block truncate">{l.serviceName}</b>
                    <span className="block truncate text-muted">
                      {formatSpan(l)} · {l.category}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {!teacherRows.length && <p className="px-5 py-5 text-lg text-muted">Ingen lektioner i dag.</p>}
      </section>

      {resources.length > 0 && (
        <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
          {timelineHeader("Lokale / køretøj")}
          {resourceStatus.map(({ resource, own }) => (
            <div key={resource.id} className="flex border-b border-line last:border-b-0" data-testid="dashboard-resource-row">
              <div className="flex w-[200px] shrink-0 flex-col justify-center px-5 py-2.5">
                <b className="truncate">{resource.name}</b>
                <span className="text-[13px] text-muted">{own.length ? `${own.length} booking${own.length === 1 ? "" : "er"}` : "Ledig hele dagen"}</span>
              </div>
              <div className="relative min-h-[48px] flex-1">
                {gridLines}
                {own.map((b) => (
                  <span
                    key={b.id}
                    className="absolute inset-y-1.5 overflow-hidden rounded-lg border border-line2 bg-soft px-2 py-1 text-[12px] leading-tight"
                    style={pos(b)}
                  >
                    <b className="block truncate">{formatSpan(b)}</b>
                    <span className="block truncate text-muted">{b.instructorName ?? b.title ?? "Kontoret"}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function Kpi({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-[20px] border p-5 ${warn ? "border-accent-line bg-accent-bg" : "border-line bg-surface"}`} data-testid="kpi">
      <b className="block text-[clamp(32px,4vw,56px)] leading-none">{value}</b>
      <span className="text-muted">{label}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const TONE = {
  busy: "bg-accent text-ink",
  free: "bg-ok text-surface",
  away: "bg-bad text-surface",
};

function Group({ title, tone, count, testId, children }: { title: string; tone: keyof typeof TONE; count: number; testId: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="flex items-center gap-2 font-bold">
        <span className={`min-w-7 rounded-full px-2 text-center text-[15px] ${TONE[tone]}`}>{count}</span>
        {title}
      </h3>
      {count ? <ul className="flex flex-col gap-1.5">{children}</ul> : <p className="text-muted">Ingen</p>}
    </div>
  );
}

function Item({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="leading-tight">
      <b className="text-[17px]">{name}</b>
      <span className="block text-[14px] text-muted">{children}</span>
    </li>
  );
}
