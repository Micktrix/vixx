import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { addDays, formatDate, formatShortDay, parseDateInput, todayDk, weekNumber, weekStart } from "@/lib/dates";
import { nextPeriod, periodFor, previousPeriod } from "@/lib/pay-period";
import { formatSpan, storedSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

const navButton = "inline-flex h-10 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold";
const tab = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-bold ${on ? "bg-accent text-ink" : "text-muted hover:text-ink"}`;

type Row = {
  instructor_id: string;
  lesson_date: string;
  start_time: string;
  span_minutes: number;
  lesson_count: number;
  services: { name: string } | null;
};

// Timeseddel til print: lærerens kørte lektioner (registreringer, ikke afviste) for en uge eller en
// lønperiode. Én side pr. lærer, eller alle lærere med sideskift. Kontoret printer eller gemmer som PDF.
export default async function TimesheetPage({ searchParams }: PageProps<"/timeseddel">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const supabase = await createClient();
  const { data: school } = await supabase.from("schools").select("name, pay_period_start_day").eq("id", membership.schoolId).single();
  const startDay = school?.pay_period_start_day ?? 21;

  // Uge (mandag–søndag) eller lønperiode.
  const byPeriod = param("visning") === "periode";
  const anchor = parseDateInput(param("dato")) ?? todayDk();
  const range = byPeriod ? periodFor(anchor, startDay) : { start: weekStart(anchor), end: addDays(weekStart(anchor), 6) };
  const prev = byPeriod ? previousPeriod(range, startDay).start : addDays(range.start, -7);
  const next = byPeriod ? nextPeriod(range, startDay).start : addDays(range.start, 7);
  const title = byPeriod ? "Timeseddel" : `Ugeseddel uge ${weekNumber(range.start)}`;
  const chosen = param("laerer");
  const href = (changes: Record<string, string>) => {
    const q = new URLSearchParams({ visning: byPeriod ? "periode" : "uge", dato: range.start, ...(chosen ? { laerer: chosen } : {}), ...changes });
    return `/timeseddel?${q}`;
  };

  const [{ data: instructors }, { data: regs }] = await Promise.all([
    supabase
      .from("instructors")
      .select("id, employee_number, is_guest, active_until, school_members(active, profiles(full_name))")
      .eq("school_id", membership.schoolId),
    supabase
      .from("registrations")
      .select("instructor_id, lesson_date, start_time, span_minutes, lesson_count, services(name)")
      .eq("school_id", membership.schoolId)
      .gte("lesson_date", range.start)
      .lte("lesson_date", range.end)
      .neq("status", "rejected")
      .order("lesson_date")
      .order("start_time"),
  ]);
  const rows = (regs ?? []) as unknown as Row[];
  // Aktive lærere, og lærere med lektioner i perioden (også hvis de er stoppet siden).
  const people = (instructors ?? [])
    .map((i) => {
      const member = i.school_members as unknown as { active: boolean; profiles: { full_name: string } | null } | null;
      return {
        id: i.id,
        name: member?.profiles?.full_name ?? "",
        employeeNumber: i.employee_number,
        isGuest: i.is_guest,
        active: !!member?.active && (!i.active_until || i.active_until >= range.start),
      };
    })
    .filter((p) => p.active || rows.some((r) => r.instructor_id === p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
  // Én lærer (også uden lektioner), eller alle lærere med lektioner i perioden.
  const sheets = chosen ? people.filter((p) => p.id === chosen) : people.filter((p) => rows.some((r) => r.instructor_id === p.id));

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 px-5 py-6 print:max-w-none print:p-0">
      <div className="flex flex-col gap-3 print:hidden">
        <Link href="/kontor/loen" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Lønoverblik
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Periode" className="flex rounded-[10px] border border-line2 bg-surface p-0.5">
            <Link href={href({ visning: "uge" })} aria-current={!byPeriod ? "page" : undefined} className={tab(!byPeriod)}>
              Uge
            </Link>
            <Link href={href({ visning: "periode" })} aria-current={byPeriod ? "page" : undefined} className={tab(byPeriod)}>
              Lønperiode
            </Link>
          </nav>
          <Link href={href({ dato: prev })} aria-label="Forrige" className={navButton}>
            ‹
          </Link>
          <Link href={href({ dato: next })} aria-label="Næste" className={navButton}>
            ›
          </Link>
          <b className="ml-1">
            {formatDate(range.start)} – {formatDate(range.end)}
          </b>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[{ id: "", name: "Alle lærere" }, ...people].map((p) => (
            <Link
              key={p.id || "alle"}
              href={href({ laerer: p.id })}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                chosen === p.id ? "border-accent bg-accent-bg text-accent-ink" : "border-line2 bg-surface text-muted hover:text-ink"
              }`}
            >
              {p.name}
            </Link>
          ))}
          <span className="ml-auto">
            <PrintButton />
          </span>
        </div>
      </div>

      {!sheets.length && <p className="text-muted print:hidden">Ingen lektioner i perioden.</p>}

      {sheets.map((p) => {
        const lessons = rows.filter((r) => r.instructor_id === p.id);
        const total = lessons.reduce((n, r) => n + r.lesson_count, 0);
        return (
          <section
            key={p.id}
            data-testid="timesheet"
            className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-6 not-last:break-after-page print:rounded-none print:border-0 print:p-0"
          >
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-ink/20 pb-3">
              <div>
                <p className="text-sm text-muted">{school?.name}</p>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p>
                  {formatDate(range.start)} – {formatDate(range.end)}
                </p>
              </div>
              <div className="text-right">
                <b className="text-lg">{p.name}</b>
                <p className="text-sm text-muted">{p.isGuest ? "Gæstelærer" : `Medarbejdernr. ${p.employeeNumber ?? "–"}`}</p>
              </div>
            </header>
            <table className="w-full text-left text-[14px]">
              <thead className="text-[12px] text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Dato</th>
                  <th className="py-2 pr-3 font-semibold">Tid</th>
                  <th className="py-2 pr-3 font-semibold">Ydelse</th>
                  <th className="py-2 text-right font-semibold">Lektioner</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((r, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatShortDay(r.lesson_date)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatSpan(storedSpan(r.start_time, r.span_minutes))}</td>
                    <td className="py-1.5 pr-3">{r.services?.name}</td>
                    <td className="py-1.5 text-right">{r.lesson_count}</td>
                  </tr>
                ))}
                {!lessons.length && (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted">
                      Ingen lektioner.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-2 font-bold">
                    I alt
                  </td>
                  <td className="pt-2 text-right font-bold" data-testid="timesheet-total">
                    {total}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
    </main>
  );
}
