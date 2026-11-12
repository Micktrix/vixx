import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, todayDk } from "@/lib/dates";
import { nowMinutesDk } from "@/lib/now-status";
import { fromMinutes, planSlotIsFree, toMinutes, type LessonPlan, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../../screen";
import { allowedServices, getTeacher, isLocked, loadTeacherPeriod } from "../../teacher-data";
import { SignoffForm, type SignoffLesson } from "./signoff-form";

type LessonRow = SignoffLesson & { sort_order: number; active: boolean };
type SignoffRow = { course_lesson_id: string; lesson_date: string; confirmed_at: string | null; instructor_name: string };

// Elevens QR-kode er scannet: se forløbet, vælg lektionen og kvittér. En kørselslektion kan registreres
// til lønnen i samme tryk. Kun lærere fra elevens skole kan se eleven (RLS).
export default async function SignoffPage({ params, searchParams }: PageProps<"/laerer/scan/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const teacher = await getTeacher();
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, service_id, active, is_demo, profiles(full_name), teams(name), lesson_signoffs(course_lesson_id, lesson_date, confirmed_at, instructor_name), courses(name, course_lessons(id, number, kind, lesson_count, content, sort_order, active))",
    )
    .eq("school_id", teacher.membership.schoolId)
    .eq("qr_token", token)
    .maybeSingle();

  const close = (
    <Link href="/laerer" className="text-sm font-semibold text-muted">
      Luk
    </Link>
  );
  if (!student || !student.active) {
    return (
      <Screen title="Ukendt elev" sub="Kvittér for en lektion" action={close}>
        <p className="rounded-[16px] border border-bad/30 bg-bad-bg px-4 py-3 text-bad">
          Koden passer ikke til en aktiv elev på din skole. Bed eleven åbne koden igen i Vixx.
        </p>
      </Screen>
    );
  }

  const name = (student.profiles as unknown as { full_name: string } | null)?.full_name ?? "";
  const team = student.teams as unknown as { name: string } | null;
  const course = student.courses as unknown as { name: string; course_lessons: LessonRow[] } | null;
  const lessons = (course?.course_lessons ?? []).filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const signoffs = new Map(((student.lesson_signoffs ?? []) as SignoffRow[]).map((s) => [s.course_lesson_id, s]));
  const missing = lessons.filter((l) => !signoffs.has(l.id));

  // Dagens skema: optagede tider og planlagte lektioner, der ikke er registreret endnu.
  const today = todayDk();
  const [period, services] = await Promise.all([loadTeacherPeriod(teacher, today, today), allowedServices(teacher)]);
  const busy = period.registrations.filter((r) => r.status !== "rejected").map((r) => ({ from: r.from, to: r.to }));
  const planned = period.lessons
    .filter((l) => !period.registrations.some((r) => r.scheduledLessonId === l.id))
    .map((l) => ({ id: l.id, label: `${fromMinutes(l.from)}–${fromMinutes(l.to)} ${l.serviceName}` }));
  const signed = typeof sp.kvitteret === "string" ? sp.kvitteret : null;

  return (
    <Screen title={name} sub={[team?.name, course?.name].filter(Boolean).join(" · ")} action={close}>
      {signed && (
        <p role="status" className="rounded-[16px] border border-ok/30 bg-ok-bg px-4 py-3 text-[15px]" data-testid="signoff-done">
          <b className="text-ok">✓ Lektion {signed} er kvitteret.</b> Eleven bekræfter nu i sin app.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-4">
        <p className="text-[15px]">
          <b>{lessons.length - missing.length}</b> af {lessons.length} lektioner kvitteret
        </p>
        <ol className="flex flex-wrap gap-1.5" data-testid="scan-lessons">
          {lessons.map((l) => {
            const s = signoffs.get(l.id);
            const tone = !s ? "border-line text-muted" : s.confirmed_at ? "border-ok/30 bg-ok-bg text-ok" : "border-accent-line bg-accent-bg text-accent-ink";
            return (
              <li
                key={l.id}
                title={s ? `${formatDate(s.lesson_date)}${s.instructor_name ? ` · ${s.instructor_name}` : ""}` : "Mangler"}
                className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold ${tone}`}
              >
                {l.number}
              </li>
            );
          })}
        </ol>
        <p className="text-[12px] text-muted">Grøn: gennemført · Orange: venter på elevens bekræftelse · Grå: mangler</p>
      </section>

      {isLocked(period, today) ? (
        <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Lønperioden er låst, så der kan ikke kvitteres i dag.</p>
      ) : missing.length === 0 ? (
        <p className="rounded-[16px] bg-ok-bg px-4 py-3 text-[15px] text-ok">Eleven har fået kvitteret for alle lektioner i forløbet.</p>
      ) : (
        <SignoffForm
          token={token}
          studentId={student.id}
          demo={student.is_demo}
          lessons={missing}
          services={services}
          defaultServiceId={student.service_id ?? ""}
          plan={teacher.plan}
          busy={busy}
          planned={planned}
          defaultStart={latestStart(teacher.plan, busy, nowMinutesDk())}
        />
      )}
    </Screen>
  );
}

// Den seneste ledige starttid i planen, der er begyndt nu: lektionen er typisk lige kørt.
function latestStart(plan: LessonPlan, busy: Span[], now: number) {
  const started = plan.starts.filter((s) => toMinutes(s) <= now && planSlotIsFree(plan, s, 1, busy));
  return started.at(-1) ?? "";
}
