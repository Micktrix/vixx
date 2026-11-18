import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../../screen";
import { getTeacher } from "../../teacher-data";
import { SignoffForm, type SignoffLesson } from "./signoff-form";

type LessonRow = SignoffLesson & { sort_order: number; active: boolean };
type SignoffRow = { course_lesson_id: string; lesson_date: string; confirmed_at: string | null; instructor_name: string };

// Elevens QR-kode er scannet: se forløbet, vælg lektionen og kvittér. Kvitteringen gælder kun elevens forløb;
// timen til lønnen registreres i kalenderen. Kun lærere fra elevens skole kan se eleven (RLS).
export default async function SignoffPage({ params, searchParams }: PageProps<"/laerer/scan/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const teacher = await getTeacher();
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, service_id, active, is_demo, profiles(full_name), teams(name), lesson_signoffs(course_lesson_id, lesson_date, confirmed_at, instructor_name), theory_signoffs(lesson_count), courses(name, theory_lessons, course_lessons(id, number, kind, lesson_count, content, sort_order, active))",
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
  const course = student.courses as unknown as { name: string; theory_lessons: number; course_lessons: LessonRow[] } | null;
  const lessons = (course?.course_lessons ?? []).filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const signoffs = new Map(((student.lesson_signoffs ?? []) as SignoffRow[]).map((s) => [s.course_lesson_id, s]));
  const missing = lessons.filter((l) => !signoffs.has(l.id));
  // Teori: tælleren plus teorilektioner i forløbet, der er kvitteret som lektioner.
  const theoryDone =
    ((student.theory_signoffs ?? []) as { lesson_count: number }[]).reduce((n, t) => n + t.lesson_count, 0) +
    lessons.filter((l) => l.kind === "theory" && signoffs.has(l.id)).reduce((n, l) => n + l.lesson_count, 0);
  const theory = course?.theory_lessons ? { done: theoryDone, total: course.theory_lessons } : null;

  const signed = typeof sp.kvitteret === "string" ? sp.kvitteret : null;

  return (
    <Screen title={name} sub={[team?.name, course?.name].filter(Boolean).join(" · ")} action={close}>
      {signed && (
        <p role="status" className="rounded-[16px] border border-ok/30 bg-ok-bg px-4 py-3 text-[15px]" data-testid="signoff-done">
          {signed === "Teori" ? (
            <b className="text-ok">✓ Teorien er kvitteret.</b>
          ) : (
            <>
              <b className="text-ok">✓ Lektion {signed} er kvitteret.</b> Eleven bekræfter nu i sin app.
            </>
          )}
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-4">
        <p className="text-[15px]">
          <b>{lessons.length - missing.length}</b> af {lessons.length} lektioner kvitteret
          {theory && (
            <span className="block text-sm text-muted" data-testid="scan-theory">
              Teori: {theory.done} af {theory.total} lektioner
            </span>
          )}
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

      {missing.length === 0 && !theory ? (
        <p className="rounded-[16px] bg-ok-bg px-4 py-3 text-[15px] text-ok">Eleven har fået kvitteret for alle lektioner i forløbet.</p>
      ) : (
        <SignoffForm
          token={token}
          studentId={student.id}
          theory={theory}
          lessons={missing}
        />
      )}
    </Screen>
  );
}

