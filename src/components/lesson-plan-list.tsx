import type { ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { lengthText, lessonLabel, lessonProgress, type LessonSignoff, type SchoolLesson } from "@/lib/lesson-plan";

// Elevens lektionsplan (trin E10): lektion 1–9 og KTA, kørt (dato og lærer) eller mangler. Bruges på elevens side
// hos kontoret og i elevens app.
export function LessonPlanList({ lessons, signoffs, showTeacher = true }: { lessons: SchoolLesson[]; signoffs: LessonSignoff[]; showTeacher?: boolean }) {
  const p = lessonProgress(lessons, signoffs);
  return (
    <ol className="flex flex-col gap-1.5" data-testid="lesson-plan">
      {p.lessons.map((l) => (
        <li key={l.id} className={`rounded-xl border px-3 py-2 text-[15px] ${l.done ? "border-ok/30 bg-ok-bg" : "border-line"}`}>
          <b>{lessonLabel(l)}</b> <span className="text-[13px] text-muted">· {lengthText(l)}</span>
          {l.done ? (
            <span className="block text-[13px] text-ok">
              ✓ {formatDate(l.done.lesson_date)}
              {showTeacher && ` · ${l.done.instructor_name}`}
              {l.done.skipped && <span className="text-bad"> · ikke gennemført: {l.done.skipped.split("\n").join(", ")}</span>}
            </span>
          ) : (
            <span className="block text-[13px] text-muted">Mangler</span>
          )}
        </li>
      ))}
    </ol>
  );
}

// Modulerne foldes sammen, når forløbet følger lektionsplanen (de bruges kun til modulplanen).
export function ModulesWrap({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Modulerne (til modulplanen)</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
