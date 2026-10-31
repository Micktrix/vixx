import Link from "next/link";
import { Pill } from "@/components/pill";
import { inputClass, primaryButtonClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { availability, formatSpan, lessonSpan, TIME_SLOTS } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { planHref } from "../calendar/params";
import { dayInfo, loadSchedule } from "../schedule-data";

// Find ledig underviser: dato, tid, antal, kategori og type → kun relevante lærere, ledige først.
export default async function FindInstructorPage({ searchParams }: PageProps<"/kontor/find">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const supabase = await createClient();

  const date = parseDateInput(one("dato") ?? "") ?? todayDk();
  const start = TIME_SLOTS.includes(one("start") ?? "") ? one("start")! : "08:00";
  const count = Math.min(12, Math.max(1, Number(one("antal")) || 1));
  const category = one("kategori") ?? "";
  const typeId = one("type") ?? "";
  const searched = !!(category && typeId);

  const [schedule, { data: categories }, { data: types }, { data: school }] = await Promise.all([
    loadSchedule(membership.schoolId, date, date),
    supabase.from("license_categories").select("code").order("sort_order"),
    supabase.from("lesson_types").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("sort_order"),
    supabase.from("schools").select("lesson_minutes").eq("id", membership.schoolId).single(),
  ]);

  const span = lessonSpan(start, count, school?.lesson_minutes ?? 45);
  const relevant = schedule.instructors.filter((i) => i.categories.includes(category) && i.lessonTypeIds.includes(typeId));
  const results = relevant
    .map((i) => ({ instructor: i, check: availability(dayInfo(schedule, i, date), span) }))
    .sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || a.instructor.name.localeCompare(b.instructor.name, "da"));
  const free = results.filter((r) => r.check.ok).length;
  const hidden = schedule.instructors.length - relevant.length;

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Find ledig underviser</h1>
      </header>

      <form className="grid gap-3 rounded-[20px] border border-line bg-surface p-[18px] sm:grid-cols-3 lg:grid-cols-6" method="get">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Dato
          <input type="date" name="dato" defaultValue={date} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Start
          <select name="start" defaultValue={start} className={inputClass}>
            {TIME_SLOTS.map((t) => (
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
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Kategori
          <select name="kategori" defaultValue={category} required className={inputClass}>
            <option value="" disabled>
              Vælg
            </option>
            {(categories ?? []).map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Type
          <select name="type" defaultValue={typeId} required className={inputClass}>
            <option value="" disabled>
              Vælg
            </option>
            {(types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
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
            {free ? `${free} ledig${free === 1 ? "" : "e"} med kompetencen` : "Ingen ledige med kompetencen"}
            {hidden ? `. ${hidden} underviser${hidden === 1 ? "" : "e"} uden kompetencen er skjult.` : "."}
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
