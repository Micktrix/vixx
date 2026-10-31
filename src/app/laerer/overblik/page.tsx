import Link from "next/link";
import { Pill } from "@/components/pill";
import { formatDate, parseDateInput, todayDk } from "@/lib/dates";
import { formatKroner } from "@/lib/money";
import { nextPeriod, periodFor, previousPeriod } from "@/lib/pay-period";
import { formatDuration } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../screen";
import { getTeacher } from "../teacher-data";

const navButton = "inline-flex size-[42px] items-center justify-center rounded-xl border border-line bg-surface text-lg";

type Row = {
  lesson_count: number;
  category_code: string;
  status: "pending" | "approved" | "rejected";
  unit_price_ore: number | null;
  services: { lesson_types: { name: string } | null } | null;
};

export default async function InstructorOverviewPage({ searchParams }: PageProps<"/laerer/overblik">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const today = todayDk();
  const range = periodFor(parseDateInput(typeof sp.dag === "string" ? sp.dag : "") ?? today, teacher.periodStartDay);
  const supabase = await createClient();

  const [{ data }, { data: holidays }] = await Promise.all([
    supabase
      .from("registrations")
      .select("lesson_count, category_code, status, unit_price_ore, services(lesson_types(name))")
      .eq("instructor_id", teacher.instructorId)
      .gte("lesson_date", range.start)
      .lte("lesson_date", range.end),
    supabase
      .from("holidays")
      .select("id, from_date, to_date, status")
      .eq("instructor_id", teacher.instructorId)
      .gte("to_date", today)
      .neq("status", "rejected")
      .order("from_date"),
  ]);

  const regs = ((data ?? []) as unknown as Row[]).filter((r) => r.status !== "rejected");
  const sum = (rows: Row[]) => rows.reduce((n, r) => n + r.lesson_count, 0);
  const approved = regs.filter((r) => r.status === "approved");
  const total = sum(regs);
  const amount = approved.reduce((n, r) => n + r.lesson_count * (r.unit_price_ore ?? 0), 0);

  const byCategory = new Map<string, { approved: number; pending: number }>();
  const byType = new Map<string, number>();
  for (const r of regs) {
    const c = byCategory.get(r.category_code) ?? { approved: 0, pending: 0 };
    c[r.status === "approved" ? "approved" : "pending"] += r.lesson_count;
    byCategory.set(r.category_code, c);
    const type = r.services?.lesson_types?.name ?? "";
    byType.set(type, (byType.get(type) ?? 0) + r.lesson_count);
  }
  const max = Math.max(1, ...[...byCategory.values()].map((v) => v.approved + v.pending));
  const daysLeft = Math.round((Date.parse(range.end) - Date.parse(today)) / 86_400_000);
  const pick = (p: { start: string; end: string }) => (p.start <= today && today <= p.end ? today : p.start);

  return (
    <Screen
      title="Mit overblik"
      sub={`Lønperiode ${formatDate(range.start)} – ${formatDate(range.end)}`}
      action={
        <span className="flex gap-2">
          <Link href={`/laerer/overblik?dag=${pick(previousPeriod(range, teacher.periodStartDay))}`} aria-label="Forrige lønperiode" className={navButton}>
            ‹
          </Link>
          <Link href={`/laerer/overblik?dag=${pick(nextPeriod(range, teacher.periodStartDay))}`} aria-label="Næste lønperiode" className={navButton}>
            ›
          </Link>
        </span>
      }
    >
      <section className="flex flex-col gap-3 rounded-[20px] border border-accent-line bg-accent-bg p-[18px]">
        <div className="flex gap-8">
          <div>
            <p className="text-[34px] leading-none font-bold" data-testid="lesson-total">{total}</p>
            <p className="text-sm text-muted">lektioner</p>
          </div>
          <div>
            <p className="text-[34px] leading-none font-bold">{formatDuration(total * teacher.lessonMinutes) || "0 t"}</p>
            <p className="text-sm text-muted">timer</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <b>{sum(approved)}</b> godkendt
          </span>
          <span>
            <b>{total - sum(approved)}</b> afventer
          </span>
          <span>
            <b data-testid="approved-amount">{formatKroner(amount)}</b> godkendt løn
          </span>
        </div>
        {range.start <= today && today <= range.end && (
          <p className="text-sm font-semibold text-accent-ink">{daysLeft} dage tilbage af perioden</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 className="font-bold">Pr. kategori</h2>
        {[...byCategory].map(([cat, v]) => (
          <div key={cat} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <b>{cat}</b>
              <span>
                {v.approved + v.pending} lek.{v.pending ? ` (${v.pending} afventer)` : ""}
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-soft">
              <span className="bg-ok" style={{ width: `${(v.approved / max) * 100}%` }} />
              <span className="bg-pend/50" style={{ width: `${(v.pending / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {!byCategory.size && <p className="text-sm text-muted">Ingen lektioner i perioden endnu.</p>}
      </section>

      {byType.size > 0 && (
        <section className="flex flex-col gap-1.5 rounded-[20px] border border-line bg-surface p-[18px]">
          <h2 className="mb-1 font-bold">Pr. type</h2>
          {[...byType].sort((a, b) => b[1] - a[1]).map(([type, n]) => (
            <div key={type} className="flex justify-between text-sm">
              <span>{type}</span>
              <b>{n}</b>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 className="font-bold">Ferie</h2>
        {(holidays ?? []).map((h) => (
          <div key={h.id} className="flex items-center justify-between text-sm">
            <span>
              {formatDate(h.from_date)} – {formatDate(h.to_date)}
            </span>
            <Pill tone={h.status === "approved" ? "ok" : "neutral"}>{h.status === "approved" ? "Godkendt" : "Afventer"}</Pill>
          </div>
        ))}
        {!holidays?.length && <p className="text-sm text-muted">Ingen kommende ferie.</p>}
        <Link
          href="/laerer/ferie"
          className="flex h-11 w-full items-center justify-center rounded-xl border border-line2 bg-surface text-[15px] font-semibold"
        >
          Anmod om ferie
        </Link>
      </section>
    </Screen>
  );
}
