import { formatDate } from "@/lib/dates";
import type { ModuleProgress } from "@/lib/module-progress";

// Skolens kørelektioner i et modul (grøn = kørt med dato, grå = mangler) og punkter, der ikke er kørt.
export function LessonStatus({ module: m }: { module: ModuleProgress }) {
  if (!m.lessons.length && !m.notDriven.length) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="lesson-status">
      <div className="flex flex-wrap gap-1.5">
        {m.lessons.map(({ lesson, doneOn }) => (
          <span
            key={lesson.id}
            title={doneOn ? `Kørt ${formatDate(doneOn)}` : "Mangler"}
            data-state={doneOn ? "done" : "missing"}
            className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${doneOn ? "border-ok/30 bg-ok-bg text-ok" : "border-line text-muted"}`}
          >
            Lektion {lesson.number}
            {doneOn ? " ✓" : ""}
          </span>
        ))}
      </div>
      {m.notDriven.length > 0 && (
        <p className="text-[13px] text-bad" data-testid="not-driven">
          Ikke kørt: {m.notDriven.map((n) => (n.lesson ? `${n.item} (lektion ${n.lesson})` : n.item)).join(" · ")}
        </p>
      )}
    </div>
  );
}
