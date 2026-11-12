import { notFound } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../laerer/screen";

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

// Elevens forside: forløbet med hvad der er gennemført, og hvad der mangler. QR-koden til
// kvittering kommer i trin E3; indtil da er intet gennemført.
export default async function StudentHomePage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, teams(name), courses(name, course_lessons(id, number, kind, lesson_count, location, content, notes, control_topic, sort_order, active))")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!student) notFound();

  const course = student.courses as unknown as { name: string; course_lessons: Lesson[] } | null;
  const team = student.teams as unknown as { name: string } | null;
  const lessons = (course?.course_lessons ?? []).filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const done = new Set<string>();
  const next = lessons.find((l) => !done.has(l.id));

  const logout = (
    <form action={signOut}>
      <button type="submit" className="text-sm font-semibold text-muted">
        Log ud
      </button>
    </form>
  );

  return (
    <Screen title={`Hej ${user.fullName.split(" ")[0]}`} sub={membership.schoolName} action={logout}>
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
            <details className={`rounded-[18px] border bg-surface ${done.has(l.id) ? "border-ok/30" : "border-line"}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span>
                  <b>Lektion {l.number}</b>
                  <span className="block text-[13px] text-muted">
                    {l.lesson_count} × 45 min. · {l.kind === "theory" ? "Teori" : "Kørsel"}
                    {l.location ? ` · ${l.location}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-semibold ${done.has(l.id) ? "text-ok" : "text-muted"}`}>
                  {done.has(l.id) ? "✓ Gennemført" : "Mangler"}
                </span>
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
