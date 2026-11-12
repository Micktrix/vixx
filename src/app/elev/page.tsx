import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../laerer/screen";
import { ConfirmButton } from "./confirm-button";

type Lesson = {
  id: string;
  number: string;
  kind: "driving" | "theory";
  lesson_count: number;
  location: string | null;
  content: string | null;
  notes: string | null;
  control_topic: string | null;
  sort_order: number;
  active: boolean;
};

type Signoff = {
  id: string;
  course_lesson_id: string;
  lesson_number: string;
  instructor_name: string;
  lesson_date: string;
  skipped_items: string | null;
  confirmed_at: string | null;
};

// Elevens forside: QR-koden til kvittering, lektioner der venter på elevens bekræftelse, og forløbet
// med hvad der er gennemført (kvitteret og bekræftet), og hvad der mangler.
export default async function StudentHomePage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, teams(name), lesson_signoffs(id, course_lesson_id, lesson_number, instructor_name, lesson_date, skipped_items, confirmed_at), courses(name, course_lessons(id, number, kind, lesson_count, location, content, notes, control_topic, sort_order, active))")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!student) notFound();

  const course = student.courses as unknown as { name: string; course_lessons: Lesson[] } | null;
  const team = student.teams as unknown as { name: string } | null;
  const lessons = (course?.course_lessons ?? []).filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const signoffs = (student.lesson_signoffs ?? []) as Signoff[];
  const signoffFor = new Map(signoffs.map((s) => [s.course_lesson_id, s]));
  const done = new Set(signoffs.filter((s) => s.confirmed_at).map((s) => s.course_lesson_id));
  const waiting = signoffs.filter((s) => !s.confirmed_at).sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  const next = lessons.find((l) => !signoffFor.has(l.id));

  const logout = (
    <form action={signOut}>
      <button type="submit" className="text-sm font-semibold text-muted">
        Log ud
      </button>
    </form>
  );

  return (
    <Screen title={`Hej ${user.fullName.split(" ")[0]}`} sub={membership.schoolName} action={logout}>
      <Link
        href="/elev/qr"
        className="flex items-center justify-center rounded-[18px] bg-accent px-4 py-4 text-[17px] font-bold text-ink"
      >
        Vis min QR-kode
      </Link>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[20px] border border-accent-line bg-accent-bg p-4" data-testid="student-waiting">
          <b>
            Du har {waiting.length === 1 ? "1 lektion" : `${waiting.length} lektioner`} at bekræfte
          </b>
          {waiting.map((w) => (
            <div key={w.id} className="flex flex-col gap-2 rounded-[14px] bg-surface p-3">
              <p className="text-[15px]">
                <b>Lektion {w.lesson_number}</b> · {formatDate(w.lesson_date)}
                {w.instructor_name && <span className="block text-[13px] text-muted">Kørelærer: {w.instructor_name}</span>}
              </p>
              {w.skipped_items && (
                <p className="text-[13px]">
                  <span className="text-muted">Ikke nået:</span> {w.skipped_items.split("\n").join(", ")}
                </p>
              )}
              <ConfirmButton id={w.id} />
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-[20px] border border-accent-line bg-accent-bg p-[18px]">
        <p className="text-sm text-muted">{team ? `${team.name} · ` : ""}Dit forløb</p>
        <h2 className="text-xl font-bold">{course?.name}</h2>
        <p className="text-[15px]">
          <b data-testid="student-done">{done.size}</b> af {lessons.length} lektioner gennemført
        </p>
        <span className="h-2 overflow-hidden rounded-full bg-surface">
          <span className="block h-full rounded-full bg-ok" style={{ width: `${lessons.length ? (done.size / lessons.length) * 100 : 0}%` }} />
        </span>
        {next && <p className="text-sm">Næste: <b>Lektion {next.number}</b></p>}
      </section>

      <ol className="flex flex-col gap-2" data-testid="student-course">
        {lessons.map((l) => (
          <li key={l.id}>
            <details className={`rounded-[18px] border bg-surface ${done.has(l.id) ? "border-ok/30" : "border-line"}`} data-testid="student-lesson">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span>
                  <b>Lektion {l.number}</b>
                  <span className="block text-[13px] text-muted">
                    {l.lesson_count} × 45 min. · {l.kind === "theory" ? "Teori" : "Kørsel"}
                    {l.location ? ` · ${l.location}` : ""}
                  </span>
                </span>
                <LessonStatus signoff={signoffFor.get(l.id)} />
              </summary>
              <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3 text-[14px]">
                {l.content && (
                  <ul className="flex flex-col gap-0.5">
                    {l.content.split("\n").map((line, k) => (
                      <li key={k}>{line}</li>
                    ))}
                  </ul>
                )}
                {l.notes && <p className="text-muted">{l.notes}</p>}
                {signoffFor.get(l.id)?.skipped_items && (
                  <p>
                    <span className="text-muted">Ikke nået:</span> {signoffFor.get(l.id)!.skipped_items!.split("\n").join(", ")}
                  </p>
                )}
                {l.control_topic && (
                  <p>
                    <span className="text-muted">Kontrolstof:</span> <b>{l.control_topic}</b>
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </Screen>
  );
}

function LessonStatus({ signoff }: { signoff: Signoff | undefined }) {
  if (!signoff) return <span className="shrink-0 text-sm font-semibold text-muted">Mangler</span>;
  if (!signoff.confirmed_at) return <span className="shrink-0 text-sm font-semibold text-accent-ink">Venter på dig</span>;
  return (
    <span className="shrink-0 text-right text-sm font-semibold text-ok">
      ✓ Gennemført
      <span className="block text-[12px] font-normal text-muted">{formatDate(signoff.lesson_date)}</span>
    </span>
  );
}
