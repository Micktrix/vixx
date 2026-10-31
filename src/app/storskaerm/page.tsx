import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";
import { requireRole } from "@/lib/auth/session";
import { loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, todayDk } from "@/lib/dates";
import { nowMinutesDk, resourceNow, teacherNow, type TeacherNow } from "@/lib/now-status";
import { resourceDetail } from "@/lib/resources";
import { formatSpan, fromMinutes, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { dayInfo, loadSchedule } from "../kontor/schedule-data";
import { AutoSwitch, LiveClock, NowLine } from "./live";
import { Legend, Panel, TileWall, type TileData, type Tone } from "./tiles";

export const metadata = { title: "Storskærm · Vixx" };

const until = (m: number | null) => (m === null ? "resten af dagen" : `til ${fromMinutes(m)}`);
const ORDER: Record<Tone, number> = { busy: 0, free: 1, away: 2, off: 3 };
const byStatus = (a: TileData, b: TileData) => ORDER[a.tone] - ORDER[b.tone] || a.name.localeCompare(b.name, "da");

function teacherTile(id: string, name: string, s: TeacherNow, lessonName?: string): TileData {
  switch (s.state) {
    case "busy":
      return { id, name, tone: "busy", line1: `Optaget ${until(s.until)}`, line2: lessonName };
    case "free":
      return { id, name, tone: "free", line1: `Ledig ${until(s.until)}` };
    case "away":
      return { id, name, tone: "away", line1: `${s.reason} ${until(s.until)}` };
    default:
      return { id, name, tone: "off", line1: "Ikke meldt klar" };
  }
}

// Dagens overblik til en skærm på kontoret. Alt skal kunne ses på én skærm uden at rulle:
// "Lige nu" viser fliser, der bliver mindre, jo flere der er; "Tidslinje" viser dagen.
// ?vis=tidslinje vælger visning, ?skift=30 skifter automatisk hvert 30. sekund. Viser aldrig elevnavne.
export default async function DashboardPage({ searchParams }: PageProps<"/storskaerm">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const view = sp.vis === "tidslinje" ? "tidslinje" : "nu";
  const rotate = Math.max(0, Math.min(600, Number(sp.skift) || 0));
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

  const teacherTiles = schedule.instructors
    .map((i) => {
      const day = dayInfo(schedule, i, today);
      const lessonNow = lessons.find((l) => l.instructorId === i.id && l.from <= now && now < l.to);
      return teacherTile(i.id, i.name, teacherNow(day, now), lessonNow?.serviceName);
    })
    .sort(byStatus);

  const resourceTiles = resources
    .map((r): TileData => {
      const own = bookings.filter((b) => b.resourceId === r.id);
      const status = resourceNow(own, now);
      const current = own.find((b) => b.from <= now && now < b.to);
      const detail = resourceDetail(r);
      return status.state === "busy"
        ? { id: r.id, name: r.name, tone: "busy", line1: `Optaget ${until(status.until)}`, line2: current?.instructorName ?? current?.title ?? "Kontoret" }
        : { id: r.id, name: r.name, tone: "free", line1: `Ledig ${until(status.until)}`, line2: detail || undefined };
    })
    .sort(byStatus);

  const countTone = (tiles: TileData[], tone: Tone) => tiles.filter((t) => t.tone === tone).length;
  const lessonCount = lessons.reduce((n, l) => n + l.count, 0);
  const working = new Set(lessons.map((l) => l.instructorId)).size;
  const qs = (v: string) => `/storskaerm?vis=${v}${rotate ? `&skift=${rotate}` : ""}`;

  return (
    <main className="flex h-dvh flex-col gap-[clamp(8px,1vw,16px)] overflow-hidden bg-bg p-[clamp(10px,1.5vw,28px)]">
      {rotate > 0 && <AutoSwitch href={qs(view === "nu" ? "tidslinje" : "nu")} seconds={rotate} />}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-[clamp(12px,1vw,16px)] text-muted">{membership.schoolName}</p>
            <h1 className="text-[clamp(20px,2vw,34px)] leading-tight font-bold">{formatLongDate(today)}</h1>
          </div>
        </div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-[clamp(13px,1.2vw,20px)]" data-testid="kpis">
          <span>
            <b>{lessonCount}</b> lektioner i dag
          </span>
          <span>
            <b>{working}</b> undervisere i dag
          </span>
          <span>
            <b>{countTone(teacherTiles, "away")}</b> fravær/ferie
          </span>
          <span className={pending ? "font-semibold text-accent-ink" : ""}>
            <b>{pending ?? 0}</b> afventer godkendelse
          </span>
        </p>
        <div className="flex items-center gap-4">
          <nav aria-label="Visning" className="flex rounded-[10px] border border-line2 bg-surface p-0.5 text-sm">
            {(["nu", "tidslinje"] as const).map((v) => (
              <Link
                key={v}
                href={qs(v)}
                aria-current={v === view ? "page" : undefined}
                className={`rounded-lg px-3 py-1 font-semibold ${v === view ? "bg-accent-bg text-accent-ink" : "text-muted"}`}
              >
                {v === "nu" ? "Lige nu" : "Tidslinje"}
              </Link>
            ))}
          </nav>
          <b className="text-[clamp(26px,3vw,50px)] leading-none">
            <LiveClock />
          </b>
          <Link href="/kontor" className="text-sm font-semibold text-muted hover:text-ink">
            ‹ Kontor
          </Link>
        </div>
      </header>

      {view === "nu" ? (
        <div className="grid min-h-0 flex-1 gap-[clamp(8px,1vw,16px)] lg:grid-cols-2">
          <Panel
            title="Undervisere"
            legend={
              <Legend
                items={[
                  { tone: "busy", label: "optaget", count: countTone(teacherTiles, "busy") },
                  { tone: "free", label: "ledige", count: countTone(teacherTiles, "free") },
                  { tone: "away", label: "fravær", count: countTone(teacherTiles, "away") },
                ]}
              />
            }
          >
            <TileWall tiles={teacherTiles} aspect={1.25} testId="teacher-tiles" />
          </Panel>
          <Panel
            title="Lokaler og køretøjer"
            legend={
              <Legend
                items={[
                  { tone: "busy", label: "optaget", count: countTone(resourceTiles, "busy") },
                  { tone: "free", label: "ledige", count: countTone(resourceTiles, "free") },
                ]}
              />
            }
          >
            <TileWall tiles={resourceTiles} aspect={1.25} testId="resource-tiles" />
          </Panel>
        </div>
      ) : (
        <Timelines schedule={schedule} resources={resources} bookings={bookings} />
      )}
    </main>
  );
}

// Dagens tidslinjer. Rækkerne deler højden, så alt kan ses på én skærm.
function Timelines({
  schedule,
  resources,
  bookings,
}: {
  schedule: Awaited<ReturnType<typeof loadSchedule>>;
  resources: Awaited<ReturnType<typeof loadResources>>;
  bookings: Awaited<ReturnType<typeof loadBookings>>;
}) {
  const today = todayDk();
  const lessons = schedule.lessons;
  const items: Span[] = [...lessons, ...schedule.absences, ...bookings];
  const from = Math.min(7 * 60, ...items.map((i) => Math.floor(i.from / 60) * 60));
  const to = Math.max(18 * 60, ...items.map((i) => Math.ceil(i.to / 60) * 60));
  const pos = (s: Span) => ({ left: `${((s.from - from) / (to - from)) * 100}%`, width: `${((s.to - s.from) / (to - from)) * 100}%` });
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const teachers = schedule.instructors.filter((i) => {
    const day = dayInfo(schedule, i, today);
    return lessons.some((l) => l.instructorId === i.id) || day.absences.length > 0 || day.holiday === "approved";
  });

  const grid = (
    <>
      {hours.map((h) => (
        <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pos({ from: h, to: h }).left }} />
      ))}
      <NowLine from={from} to={to} />
    </>
  );
  const header = (title: string) => (
    <div className="flex shrink-0 border-b border-line text-[clamp(11px,0.9vw,14px)] text-muted">
      <div className="w-[clamp(120px,13vw,220px)] shrink-0 px-4 py-1.5 font-semibold">{title}</div>
      <div className="relative flex-1">
        {hours.map((h) => (
          <span key={h} className="absolute top-1.5 -translate-x-1/2" style={{ left: pos({ from: h, to: h }).left }}>
            {fromMinutes(h)}
          </span>
        ))}
      </div>
    </div>
  );
  const row = (key: string, name: string, children: ReactNode, testId: string) => (
    <div key={key} className="flex min-h-[18px] flex-1 border-b border-line last:border-b-0" data-testid={testId}>
      <div className="flex w-[clamp(120px,13vw,220px)] shrink-0 items-center truncate px-4 text-[clamp(11px,1vw,17px)] font-bold">{name}</div>
      <div className="relative flex-1">
        {grid}
        {children}
      </div>
    </div>
  );
  const block = (cls: string) =>
    `absolute inset-y-[12%] flex items-center overflow-hidden rounded-md px-1.5 text-[clamp(9px,0.85vw,14px)] leading-tight whitespace-nowrap ${cls}`;

  return (
    <div
      className="grid min-h-0 flex-1 gap-[clamp(8px,1vw,16px)]"
      style={{ gridTemplateRows: `${Math.max(teachers.length, 1) + 1}fr ${Math.max(resources.length, 1) + 1}fr` }}
    >
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-line bg-surface">
        {header("Underviser")}
        {teachers.map((i) => {
          const day = dayInfo(schedule, i, today);
          return row(
            i.id,
            i.name,
            <>
              {day.holiday === "approved" && (
                <span className={block("bg-soft text-muted")} style={pos({ from, to })}>
                  Ferie
                </span>
              )}
              {day.absences.map((a, k) => (
                <span key={k} className={block("bg-bad-bg text-bad")} style={pos(a)}>
                  Fravær {formatSpan(a)}
                </span>
              ))}
              {lessons
                .filter((l) => l.instructorId === i.id)
                .map((l) => (
                  <span key={l.id} className={block("border border-accent-line bg-accent-bg")} style={pos(l)}>
                    <b>{l.serviceName}</b>&nbsp;{formatSpan(l)}
                  </span>
                ))}
            </>,
            "dashboard-row",
          );
        })}
        {!teachers.length && <p className="px-4 py-3 text-muted">Ingen lektioner i dag.</p>}
      </section>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-line bg-surface">
        {header("Lokale / køretøj")}
        {resources.map((r) =>
          row(
            r.id,
            r.name,
            bookings
              .filter((b) => b.resourceId === r.id)
              .map((b) => (
                <span key={b.id} className={block("border border-line2 bg-soft")} style={pos(b)}>
                  <b>{formatSpan(b)}</b>&nbsp;{b.instructorName ?? b.title ?? "Kontoret"}
                </span>
              )),
            "dashboard-resource-row",
          ),
        )}
        {!resources.length && <p className="px-4 py-3 text-muted">Ingen lokaler eller køretøjer.</p>}
      </section>
    </div>
  );
}
