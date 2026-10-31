import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { requireRole } from "@/lib/auth/session";
import { loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, todayDk } from "@/lib/dates";
import { formatSpan, fromMinutes, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { dayInfo, loadSchedule, REASON_LABEL } from "../kontor/schedule-data";
import { LiveClock, NowLine } from "./live";

export const metadata = { title: "Storskærm · Vixx" };

// Dagens overblik til en skærm på kontoret. Viser aldrig elevnavne.
export default async function DashboardPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const today = todayDk();
  const supabase = await createClient();

  const [schedule, resources, bookings, { count: pending }] = await Promise.all([
    loadSchedule(membership.schoolId, today, today),
    loadResources(membership.schoolId),
    loadBookings(membership.schoolId, today, today),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("school_id", membership.schoolId).eq("status", "pending"),
  ]);

  const lessons = schedule.lessons;
  const working = schedule.instructors.filter((i) => lessons.some((l) => l.instructorId === i.id));
  const away = schedule.instructors
    .map((i) => {
      const day = dayInfo(schedule, i, today);
      if (day.holiday === "approved") return { name: i.name, text: "Ferie hele dagen" };
      const abs = schedule.absences.filter((a) => a.instructorId === i.id);
      return abs.length ? { name: i.name, text: abs.map((a) => `${REASON_LABEL[a.reason]} ${formatSpan(a)}`).join(", ") } : null;
    })
    .filter((x): x is { name: string; text: string } => !!x);

  // Tidslinje 07–18, udvidet hvis noget ligger uden for.
  const items: Span[] = [...lessons, ...schedule.absences];
  const from = Math.min(7 * 60, ...items.map((i) => Math.floor(i.from / 60) * 60));
  const to = Math.max(18 * 60, ...items.map((i) => Math.ceil(i.to / 60) * 60));
  const pos = (s: Span) => ({ left: `${((s.from - from) / (to - from)) * 100}%`, width: `${((s.to - s.from) / (to - from)) * 100}%` });
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const rows = schedule.instructors.filter((i) => lessons.some((l) => l.instructorId === i.id) || away.some((a) => a.name === i.name));

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
        <Kpi label="undervisere i dag" value={working.length} />
        <Kpi label="fravær / ferie" value={away.length} />
        <Kpi label="afventer godkendelse" value={pending ?? 0} warn={(pending ?? 0) > 0} />
      </section>

      <div className="grid flex-1 gap-5 xl:grid-cols-[1fr_340px]">
        <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <div className="flex border-b border-line text-[13px] text-muted">
            <div className="w-[200px] shrink-0 px-5 py-2.5 font-semibold">Underviser</div>
            <div className="relative flex-1">
              {hours.map((h) => (
                <span key={h} className="absolute top-2.5 -translate-x-1/2" style={{ left: pos({ from: h, to: h }).left }}>
                  {fromMinutes(h)}
                </span>
              ))}
            </div>
          </div>
          {rows.map((i) => {
            const own = lessons.filter((l) => l.instructorId === i.id);
            const day = dayInfo(schedule, i, today);
            return (
              <div key={i.id} className="flex border-b border-line last:border-b-0" data-testid="dashboard-row">
                <div className="flex w-[200px] shrink-0 flex-col justify-center px-5 py-3">
                  <b className="truncate text-[17px]">{i.name}</b>
                  <span className="text-[13px] text-muted">
                    {own.length ? `${own.reduce((n, l) => n + l.count, 0)} lek.` : day.holiday === "approved" ? "Ferie" : "Fravær"}
                  </span>
                </div>
                <div className="relative min-h-[64px] flex-1">
                  {hours.map((h) => (
                    <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pos({ from: h, to: h }).left }} />
                  ))}
                  <NowLine from={from} to={to} />
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
          {!rows.length && <p className="px-5 py-6 text-lg text-muted">Intet planlagt i dag.</p>}
        </section>

        <aside className="flex flex-col gap-5">
          <section className="rounded-[20px] border border-line bg-surface p-5">
            <h2 className="mb-2 text-lg font-bold">Fravær og ferie</h2>
            {away.length ? (
              <ul className="flex flex-col gap-1.5">
                {away.map((a) => (
                  <li key={a.name}>
                    <b>{a.name}</b> <span className="text-muted">· {a.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Alle er på arbejde.</p>
            )}
          </section>
          <section className="rounded-[20px] border border-line bg-surface p-5">
            <h2 className="mb-2 text-lg font-bold">Lokaler og køretøjer</h2>
            {bookings.length ? (
              <ul className="flex flex-col gap-1.5">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <b>{formatSpan(b)}</b> {resources.find((r) => r.id === b.resourceId)?.name}
                    <span className="text-muted"> · {b.instructorName ?? b.title ?? "Kontoret"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Ingen bookinger i dag.</p>
            )}
          </section>
        </aside>
      </div>
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
