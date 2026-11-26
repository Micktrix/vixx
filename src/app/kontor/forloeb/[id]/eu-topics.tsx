import { createClient } from "@/lib/supabase/server";

// EU-forløbets emner (med den faste "faktisk anvendt tid" fra blanketten) og køretimer (trin E9a). Rettes i E9b.
export async function EuTopicList({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("eu_topics")
    .select("id, kind, sort, code, goal, hours, lessons")
    .eq("course_id", courseId)
    .order("kind", { ascending: false })
    .order("sort");
  const rows = data ?? [];
  const topics = rows.filter((r) => r.kind === "topic");
  const drives = rows.filter((r) => r.kind === "drive");
  const total = topics.reduce((n, t) => n + Number(t.hours ?? 0), 0);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="eu-topics">
      <h2 className="text-lg font-bold">Emner</h2>
      <ol className="flex flex-col gap-1 text-[15px]">
        {topics.map((t) => (
          <li key={t.id} className="flex gap-3">
            <b className="w-12 shrink-0">{t.code}</b>
            <span className="flex-1">{t.goal}</span>
            <span className="shrink-0 text-muted">{t.hours != null ? `${Number(t.hours)} t` : "–"}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">I alt {total} t (faktisk anvendt tid fra blanketten; tom = skrives i hånden).</p>
      <h2 className="text-lg font-bold">Køretimer</h2>
      {drives.length ? (
        <ul className="text-[15px]">
          {drives.map((d) => (
            <li key={d.id}>
              {d.code} · {d.lessons} × 45 min.
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Ingen faste køretimer; læreren skriver emnet ved scanning.</p>
      )}
    </section>
  );
}
