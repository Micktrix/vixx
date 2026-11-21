import { formatDate } from "@/lib/dates";
import { isDarkTopic, type ModuleCount, type ModuleProgress } from "@/lib/module-progress";

type Count = ModuleCount & { instructor_name?: string };

// Ønske 2 (21. nov. 2026): et modul rullet ud på elevens side. Hvad mangler (køreemner, mørke 7.19, teori, kørsel),
// og hvem kørte hvornår.
export function ModuleDetails({ module: m, counts, theoryAtScan }: { module: ModuleProgress; counts: Count[]; theoryAtScan: boolean }) {
  const mine = counts.filter((c) => c.course_module_id === m.id).sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  const driven = mine.some((c) => c.kind === "driving");
  const theory = theoryAtScan
    ? `${m.theory} af ${m.min_theory}`
    : m.completed?.theory_lessons != null
      ? `${m.completed.theory_lessons} (bekræftet ved afslutning)`
      : `bekræftes ved afslutning (min. ${m.min_theory})`;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2 text-[14px]" data-testid="module-details">
      <p>
        <b>Kørsel</b> {m.driving} af {m.min_driving} · <b>Teori</b> {theory}
        {m.min_dark > 0 && (
          <>
            {" "}
            · <b>Mørke (7.19)</b>{" "}
            <span className={m.darkDone ? "text-ok" : "text-bad"}>{m.darkDone ? "kørt" : "mangler"}</span>
          </>
        )}
      </p>
      {m.drivingTopics.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-testid="module-topics">
          {m.drivingTopics.map((t) => {
            const done = m.drivenTopics.includes(t);
            const dark = isDarkTopic(t) && m.min_dark > 0;
            const state = done ? "kørt" : driven || dark ? "mangler" : "ikke kørt endnu";
            return (
              <li key={t} className="flex items-baseline gap-2">
                <span className={`shrink-0 font-bold ${done ? "text-ok" : state === "mangler" ? "text-bad" : "text-muted"}`}>
                  {done ? "✓" : "○"}
                </span>
                <span>
                  {t} <span className={`text-[12px] ${done ? "text-ok" : state === "mangler" ? "text-bad" : "text-muted"}`}>{state}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {mine.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-[13px] text-muted" data-testid="module-lessons">
          {mine.map((c, i) => (
            <li key={i}>
              {formatDate(c.lesson_date)} · {c.lesson_count} {c.kind === "theory" ? "teori" : "kørsel"}
              {c.dark && " · mørke"}
              {c.instructor_name && ` · ${c.instructor_name}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Ingen lektioner scannet i modulet endnu.</p>
      )}
    </div>
  );
}
