import { Box } from "@/components/box";
import { formatDate, todayDk } from "@/lib/dates";
import { EuSignForm } from "./eu-sign-form";
import { EU_SIGNOFF_FIELDS, EU_TOPIC_FIELDS, euOfText, euProgress, hoursText, type EuSignoff, type EuTopic } from "@/lib/eu";
import { createClient } from "@/lib/supabase/server";

// EU-forløbet på elevens side (trin E9a): hvad er bekræftet (dato og lærer), hvad mangler, og print af EU-planen.
export async function EuBox({ studentId, courseId, canSign }: { studentId: string; courseId: string; canSign: boolean }) {
  const supabase = await createClient();
  const [{ data: course }, { data: topics }, { data: signoffs }] = await Promise.all([
    supabase.from("courses").select("name").eq("id", courseId).single(),
    supabase.from("eu_topics").select(EU_TOPIC_FIELDS).eq("course_id", courseId),
    supabase.from("eu_signoffs").select(EU_SIGNOFF_FIELDS).eq("student_id", studentId),
  ]);
  const p = euProgress((topics ?? []) as EuTopic[], (signoffs ?? []) as EuSignoff[]);
  const done = p.topics.filter((t) => t.done).length;
  return (
    <Box title={course?.name ?? "EU"} hint={`${done} af ${p.topics.length} emner · ${euOfText(p.hoursDone, p.hoursTotal)} · ${p.driveLessons} køretimer`}>
      <a
        href={`/api/eu-plan/${studentId}`}
        target="_blank"
        rel="noopener"
        className="self-start rounded-[12px] border border-line px-4 py-2 text-sm font-bold hover:border-accent"
        data-testid="print-eu-plan"
      >
        Print EU-plan (PDF)
      </a>
      <ul className="flex flex-col gap-1 text-[14px]" data-testid="eu-topics-status">
        {p.topics.map((t) => (
          <li key={t.id} className={`flex flex-wrap gap-x-2 rounded-lg px-2 py-1 ${t.done ? "bg-ok-bg" : ""}`}>
            <b className="w-12 shrink-0">{t.code}</b>
            <span className="min-w-0 flex-1">{t.goal}</span>
            <span className={t.done ? "text-ok" : "text-muted"}>
              {t.done ? `✓ ${formatDate(t.done.signed_on)} · ${t.done.instructor_name}` : "mangler"} · {hoursText(t.hours)}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="text-sm font-bold">Køretimer</h3>
      <ul className="flex flex-col gap-0.5 text-[14px]">
        {p.drives.map((d, i) => (
          <li key={d.done?.id ?? `${d.topicId}-${i}`} className={d.done ? "text-ok" : "text-muted"}>
            {d.done ? "✓" : "○"} {d.title} ({d.lessons} × 45 min.)
            {d.done && ` · ${formatDate(d.done.signed_on)} · ${d.done.instructor_name}`}
          </li>
        ))}
        {!p.drives.length && <li className="text-muted">Ingen køretimer endnu.</li>}
      </ul>
      {canSign && (
        <EuSignForm
          studentId={studentId}
          today={todayDk()}
          topics={p.topics.filter((t) => !t.done).map((t) => ({ id: t.id, code: t.code, goal: t.goal, hours: hoursText(t.hours) }))}
          drives={p.drives.filter((d) => !d.done && d.topicId).map((d) => ({ topicId: d.topicId!, title: d.title, lessons: d.lessons }))}
        />
      )}
      <p className="text-[13px] text-muted">Lærerne bekræfter ved scanning eller her. Eleven skriver under med kuglepen på den printede plan; CPR skrives i hånden.</p>
    </Box>
  );
}
