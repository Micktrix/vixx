import Link from "next/link";
import { Pill } from "@/components/pill";
import { inputClass, primaryButtonClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { availability, formatSpan, planSpan, toPlan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { planHref } from "../calendar/params";
import { dayInfo, loadSchedule } from "../schedule-data";

// Find ledig underviser: dato, tid og antal → alle lærere, ledige først.
export default async function FindInstructorPage({ searchParams }: PageProps<"/kontor/find">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const supabase = await createClient();

  const date = parseDateInput(one("dato") ?? "") ?? todayDk();
  const count = Math.min(12, Math.max(1, Number(one("antal")) || 1));
  const searched = !!one("dato");

  const [schedule, { data: school }] = await Promise.all([
    loadSchedule(membership.schoolId, date, date),
    supabase.from("schools").select("lesson_minutes, lesson_starts").eq("id", membership.schoolId).single(),
  ]);

  const plan = toPlan(school?.lesson_starts, school?.lesson_minutes ?? 45);
  const start = plan.starts.includes(one("start") ?? "") ? one("start")! : plan.starts[0];
  const span = planSpan(plan, start, count);
  const results = schedule.instructors
    .map((i) => ({ instructor: i, check: availability(dayInfo(schedule, i, date), span) }))
    .sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || a.instructor.name.localeCompare(b.instructor.name, "da"));
  const free = results.filter((r) => r.check.ok).length;

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Find ledig underviser</h1>
      </header>

      <form className="grid gap-3 rounded-[20px] border border-line bg-surface p-[18px] sm:grid-cols-2 lg:grid-cols-4" method="get">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Dato
          <input type="date" name="dato" defaultValue={date} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Start
          <select name="start" defaultValue={start} className={inputClass}>
            {plan.starts.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Antal
          <select name="antal" defaultValue={count} className={inputClass}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className={primaryButtonClass}>
            Søg
          </button>
        </div>
      </form>

      {searched && (
        <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
          <h2 className="text-lg font-bold">
            {formatLongDate(date)} · {formatSpan(span)}
          </h2>
          <p className="text-muted">
            {free ? `${free} ledig${free === 1 ? "" : "e"} af ${results.length}.` : "Ingen ledige."}
          </p>
          <ul className="flex flex-col gap-2">
            {results.map(({ instructor, check }) => (
              <li
                key={instructor.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 ${
                  check.ok ? "bg-surface" : "bg-soft text-muted"
                }`}
                data-testid="find-result"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <b className={check.ok ? "text-ink" : ""}>{instructor.name}</b>
                  {check.ok ? <Pill tone="ok">Ledig</Pill> : <Pill>Optaget</Pill>}
                  {check.why && <span className="text-sm">{check.why}</span>}
                  {check.warn && <Pill tone="accent">{check.warn}</Pill>}
                </span>
                {check.ok && (
                  <Link
                    href={planHref({ instructor: instructor.id, date, start })}
                    className="text-sm font-semibold text-accent-ink hover:underline"
                  >
                    Planlæg
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
