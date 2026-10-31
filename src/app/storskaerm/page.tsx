import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { requireRole } from "@/lib/auth/session";
import { loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, todayDk } from "@/lib/dates";
import { nowMinutesDk, resourceNow, teacherNow, type TeacherNow } from "@/lib/now-status";
import { fromMinutes, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { dayInfo, loadSchedule } from "../kontor/schedule-data";
import { Board, Legend, Stat, type Block, type BoardRow, type Tone } from "./board";
import { LiveClock } from "./live";

export const metadata = { title: "Storskærm · Vixx" };

// Kort status, så navnet har plads; farven viser, om man er optaget eller ledig.
const until = (word: string, m: number | null) => (m === null ? word : `${word} til ${fromMinutes(m)}`);
const ORDER: Record<Tone, number> = { busy: 0, free: 1, away: 2, off: 3 };
const byStatus = (a: BoardRow, b: BoardRow) => ORDER[a.tone] - ORDER[b.tone] || a.name.localeCompare(b.name, "da");

function teacherStatus(s: TeacherNow): { tone: Tone; status: string } {
  switch (s.state) {
    case "busy":
      return { tone: "busy", status: until("Optaget", s.until) };
    case "free":
      return { tone: "free", status: until("Ledig", s.until) };
    case "away":
      return { tone: "away", status: until(s.reason, s.until) };
    default:
      return { tone: "off", status: "Ikke klar" };
  }
}

// Dagens overblik som ét dashboard til en skærm på kontoret: nøgletal øverst, og for hver underviser
// og hvert lokale/køretøj status lige nu + dagens tidslinje. Alt kan ses uden at rulle. Viser aldrig elevnavne.
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

  // Tidslinjen dækker mindst 07–18 og udvides, hvis noget ligger udenfor.
  const items: Span[] = [...lessons, ...schedule.absences, ...bookings];
  const range = {
    from: Math.min(7 * 60, ...items.map((i) => Math.floor(i.from / 60) * 60)),
    to: Math.max(18 * 60, ...items.map((i) => Math.ceil(i.to / 60) * 60)),
  };

  const teacherRows = schedule.instructors
    .map((i): BoardRow => {
      const day = dayInfo(schedule, i, today);
      const blocks: Block[] = [
        ...(day.holiday === "approved" ? [{ key: "ferie", ...range, label: "Ferie", className: "bg-soft text-muted" }] : []),
        ...day.absences.map((a, k) => ({ key: `a${k}`, from: a.from, to: a.to, label: "Fravær", className: "bg-bad-bg text-bad" })),
        ...lessons
          .filter((l) => l.instructorId === i.id)
          .map((l) => ({
            key: l.id,
            from: l.from,
            to: l.to,
            label: <b>{l.serviceName}</b>,
            className: l.from <= now && now < l.to ? "bg-accent text-white" : "border border-accent-line bg-accent-bg",
          })),
      ];
      return { id: i.id, name: i.name, ...teacherStatus(teacherNow(day, now)), blocks };
    })
    .sort(byStatus);

  const resourceRows = resources
    .map((r): BoardRow => {
      const own = bookings.filter((b) => b.resourceId === r.id);
      const s = resourceNow(own, now);
      return {
        id: r.id,
        name: r.name,
        tone: s.state,
        status: until(s.state === "busy" ? "Optaget" : "Ledig", s.until),
        blocks: own.map((b) => ({
          key: b.id,
          from: b.from,
          to: b.to,
          label: b.instructorName ?? b.title ?? "Kontoret",
          className: b.from <= now && now < b.to ? "bg-ink/80 text-white" : "border border-line2 bg-soft",
        })),
      };
    })
    .sort(byStatus);

  const count = (rows: BoardRow[], tone: Tone) => rows.filter((r) => r.tone === tone).length;
  const freeOf = (kind: "room" | "vehicle") => {
    const ids = new Set(resources.filter((r) => r.kind === kind).map((r) => r.id));
    const rows = resourceRows.filter((r) => ids.has(r.id));
    return { free: count(rows, "free"), total: rows.length };
  };
  const rooms = freeOf("room");
  const vehicles = freeOf("vehicle");
  const lessonCount = lessons.reduce((n, l) => n + l.count, 0);
  const done = lessons.filter((l) => l.to <= now).reduce((n, l) => n + l.count, 0);

  return (
    <main className="flex h-dvh flex-col gap-[clamp(8px,0.9vw,16px)] overflow-hidden bg-bg p-[clamp(10px,1.3vw,24px)]">
      <header className="flex shrink-0 items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-[clamp(12px,0.9vw,16px)] text-muted">{membership.schoolName}</p>
            <h1 className="text-[clamp(20px,1.8vw,32px)] leading-tight font-bold">{formatLongDate(today)}</h1>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <b className="text-[clamp(26px,2.8vw,48px)] leading-none">
            <LiveClock />
          </b>
          <Link href="/kontor" className="text-sm font-semibold text-muted hover:text-ink">
            ‹ Kontor
          </Link>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-3 gap-[clamp(8px,0.9vw,16px)] lg:grid-cols-6" data-testid="kpis">
        <Stat label="Lektioner i dag" value={lessonCount} sub={`${done} kørt`} />
        <Stat label="Undervisere optaget nu" value={count(teacherRows, "busy")} sub={`af ${teacherRows.length}`} />
        <Stat label="Undervisere ledige nu" value={count(teacherRows, "free")} />
        <Stat label="Lokaler ledige nu" value={rooms.free} sub={`af ${rooms.total}`} />
        <Stat label="Køretøjer ledige nu" value={vehicles.free} sub={`af ${vehicles.total}`} />
        <Stat label="Afventer godkendelse" value={pending ?? 0} accent={!!pending} />
      </div>

      <div className="grid min-h-0 flex-1 gap-[clamp(8px,0.9vw,16px)] lg:grid-cols-[2.2fr_1fr]">
        <Board
          title="Undervisere"
          testId="teacher-board"
          rows={teacherRows}
          range={range}
          empty="Ingen undervisere."
          legend={
            <Legend
              items={[
                { tone: "busy", label: "optaget", count: count(teacherRows, "busy") },
                { tone: "free", label: "ledige", count: count(teacherRows, "free") },
                { tone: "away", label: "fravær/ferie", count: count(teacherRows, "away") },
              ]}
            />
          }
        />
        <Board
          title="Lokaler og køretøjer"
          testId="resource-board"
          rows={resourceRows}
          range={range}
          empty="Ingen lokaler eller køretøjer."
          legend={
            <Legend
              items={[
                { tone: "busy", label: "optaget", count: count(resourceRows, "busy") },
                { tone: "free", label: "ledige", count: count(resourceRows, "free") },
              ]}
            />
          }
        />
      </div>
    </main>
  );
}
