import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { requireRole } from "@/lib/auth/session";
import { loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, todayDk } from "@/lib/dates";
import { nowMinutesDk, resourceNow } from "@/lib/now-status";
import { formatSpan, fromMinutes, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { dayInfo, loadSchedule, REASON_LABEL } from "../kontor/schedule-data";
import { LiveClock, NowLine } from "./live";

export const metadata = { title: "Storskærm · Vixx" };

type Block = Span & { key: string; title: string; sub?: string; tone: "lesson" | "booking" | "away" | "holiday" };

const BLOCK: Record<Block["tone"], string> = {
  lesson: "border border-accent-line bg-accent-bg",
  booking: "border border-line2 bg-soft",
  away: "bg-bad-bg text-bad",
  holiday: "bg-soft text-muted",
};

// Dagens overblik til en skærm på kontoret: én række pr. lærer med lektioner (med bil/lokale), møder,
// fravær og ferie, og i siden de lokaler og biler, der er ledige lige nu. Rækkerne deler højden, så alt kan ses på én
// skærm uden at rulle. Viser aldrig elevnavne.
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
  const resourceById = new Map(resources.map((r) => [r.id, r]));

  // Tidslinje 07–18, udvidet hvis noget ligger uden for.
  const items: Span[] = [...lessons, ...schedule.absences, ...bookings];
  const from = Math.min(7 * 60, ...items.map((i) => Math.floor(i.from / 60) * 60));
  const to = Math.max(18 * 60, ...items.map((i) => Math.ceil(i.to / 60) * 60));
  const range = { from, to };
  const pos = (s: Span) => ({ left: `${((s.from - from) / (to - from)) * 100}%`, width: `${((s.to - s.from) / (to - from)) * 100}%` });
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);

  // Én række pr. lærer, der har noget i dag: lektioner, egne bookinger (fx møder), fravær eller ferie.
  const rows = schedule.instructors
    .map((i) => {
      const day = dayInfo(schedule, i, today);
      const own = lessons.filter((l) => l.instructorId === i.id);
      const ownBookings = bookings.filter((b) => b.instructorId === i.id && !b.lessonId);
      const blocks: Block[] = [
        ...(day.holiday === "approved" ? [{ key: "ferie", ...range, title: "Ferie", tone: "holiday" as const }] : []),
        ...schedule.absences
          .filter((a) => a.instructorId === i.id)
          .map((a) => ({ key: a.id, from: a.from, to: a.to, title: REASON_LABEL[a.reason], sub: formatSpan(a), tone: "away" as const })),
        ...own.map((l) => {
          const booking = bookings.find((b) => b.lessonId === l.id);
          const resource = booking ? resourceById.get(booking.resourceId)?.name : undefined;
          // Bil eller lokale står med i første linje, så den også ses, når rækkerne er lave.
          return { key: l.id, from: l.from, to: l.to, title: [l.serviceName, resource].filter(Boolean).join(" · "), sub: formatSpan(l), tone: "lesson" as const };
        }),
        ...ownBookings.map((b) => ({
          key: b.id,
          from: b.from,
          to: b.to,
          title: [b.title ?? "Booket", resourceById.get(b.resourceId)?.name].filter(Boolean).join(" · "),
          sub: formatSpan(b),
          tone: "booking" as const,
        })),
      ];
      const count = own.reduce((n, l) => n + l.count, 0);
      const label = count ? `${count} lek.` : day.holiday === "approved" ? "Ferie" : ownBookings.length && !day.absences.length ? "Møde" : "Fravær";
      return { id: i.id, name: i.name, label, blocks };
    })
    .filter((r) => r.blocks.length);
  const compact = rows.length > 12;

  // Ledige lokaler og biler lige nu, og hvor længe. De optagne står på lærerens række.
  const freeNow = (kind: "room" | "vehicle") =>
    resources
      .filter((r) => r.kind === kind)
      .map((r) => ({ r, s: resourceNow(bookings.filter((b) => b.resourceId === r.id), now) }))
      .filter((x) => x.s.state === "free")
      .map(({ r, s }) => ({ id: r.id, name: r.name, until: s.until }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  const freeRooms = freeNow("room");
  const freeVehicles = freeNow("vehicle");

  const away = schedule.instructors.filter((i) => {
    const day = dayInfo(schedule, i, today);
    return day.holiday === "approved" || day.absences.length > 0;
  }).length;

  return (
    <main className="flex h-dvh flex-col gap-[clamp(10px,1.2vw,20px)] overflow-hidden bg-bg p-[clamp(14px,2vw,32px)]">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-muted">{membership.schoolName}</p>
            <h1 className="text-[clamp(22px,2.2vw,38px)] leading-tight font-bold">{formatLongDate(today)}</h1>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <b className="text-[clamp(28px,3vw,50px)] leading-none">
            <LiveClock />
          </b>
          <Link href="/kontor" className="text-sm font-semibold text-muted hover:text-ink">
            ‹ Kontor
          </Link>
        </div>
      </header>

      <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <Kpi label="lektioner i dag" value={lessons.reduce((n, l) => n + l.count, 0)} />
        <Kpi label="undervisere i dag" value={new Set(lessons.map((l) => l.instructorId)).size} />
        <Kpi label="fravær / ferie" value={away} />
        <Kpi label="afventer godkendelse" value={pending ?? 0} warn={(pending ?? 0) > 0} />
      </section>

      <div className="grid min-h-0 flex-1 gap-[clamp(10px,1.2vw,20px)] xl:grid-cols-[1fr_minmax(300px,24vw)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-line bg-surface">
          <div className="flex shrink-0 border-b border-line text-[clamp(12px,0.75vw,14px)] text-muted">
            <div className="w-[clamp(150px,11vw,220px)] shrink-0 px-5 py-2.5 font-semibold">Underviser</div>
            <div className="relative flex-1">
              {hours.map((h) => (
                <span key={h} className="absolute top-2.5 -translate-x-1/2 first:translate-x-0" style={{ left: pos({ from: h, to: h }).left }}>
                  {fromMinutes(h)}
                </span>
              ))}
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="flex max-h-[76px] min-h-0 flex-1 border-b border-line last:border-b-0" data-testid="dashboard-row">
              <div className="flex w-[clamp(150px,11vw,220px)] shrink-0 flex-col justify-center overflow-hidden px-5">
                <b className={`truncate ${compact ? "text-[clamp(12px,0.9vw,16px)]" : "text-[clamp(14px,1.05vw,19px)]"}`}>{r.name}</b>
                {!compact && <span className="text-[13px] text-muted">{r.label}</span>}
              </div>
              <div className="relative flex-1">
                {hours.map((h) => (
                  <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pos({ from: h, to: h }).left }} />
                ))}
                <NowLine from={from} to={to} />
                {r.blocks.map((b) => (
                  <span
                    key={b.key}
                    className={`absolute inset-y-[10%] flex flex-col justify-center overflow-hidden rounded-lg px-2 leading-tight ${BLOCK[b.tone]} ${
                      compact ? "text-[clamp(10px,0.7vw,13px)]" : "text-[clamp(11px,0.75vw,14px)]"
                    }`}
                    style={pos(b)}
                    data-testid="dashboard-block"
                  >
                    <b className="truncate">{b.title}</b>
                    {!compact && b.sub && <span className="truncate text-muted">{b.sub}</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!rows.length && <p className="px-5 py-6 text-lg text-muted">Intet planlagt i dag.</p>}
        </section>

        <aside className="flex min-h-0 flex-col gap-5 overflow-hidden rounded-[20px] border border-line bg-surface p-5" data-testid="free-resources">
          <FreeList title="Ledige lokaler" items={freeRooms} empty="Alle lokaler er optaget." testId="free-rooms" />
          <FreeList title="Ledige biler" items={freeVehicles} empty="Alle biler er optaget." testId="free-vehicles" />
        </aside>
      </div>
    </main>
  );
}

function FreeList({
  title,
  items,
  empty,
  testId,
}: {
  title: string;
  items: { id: string; name: string; until: number | null }[];
  empty: string;
  testId: string;
}) {
  return (
    <section className="flex min-h-0 flex-col" data-testid={testId}>
      <h2 className="mb-2.5 shrink-0 text-[clamp(16px,1.2vw,22px)] font-bold">
        {title} <span className="font-normal text-muted">{items.length}</span>
      </h2>
      {items.length ? (
        <ul className="flex min-h-0 flex-wrap gap-2 overflow-hidden">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl bg-ok-bg px-3 py-1.5 text-ok" data-testid="free-resource">
              <b className="text-[clamp(13px,0.95vw,17px)]">{i.name}</b>
              {i.until !== null && <span className="text-[13px]"> · til {fromMinutes(i.until)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{empty}</p>
      )}
    </section>
  );
}

function Kpi({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`rounded-[20px] border px-5 py-[clamp(10px,1vw,18px)] ${warn ? "border-accent-line bg-accent-bg" : "border-line bg-surface"}`}
      data-testid="kpi"
    >
      <b className="block text-[clamp(28px,3vw,52px)] leading-none">{value}</b>
      <span className="text-muted">{label}</span>
    </div>
  );
}
