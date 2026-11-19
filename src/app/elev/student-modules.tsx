import { formatDate } from "@/lib/dates";
import { completionText, progressText, suggestedModule, type ModuleProgress } from "@/lib/module-progress";

// Elevens modulplan (trin E8): hvert modul med lektioner talt op mod minimum, opstartsdato og emner.
export function StudentModules({
  courseName,
  teamName,
  modules,
  topics,
}: {
  courseName: string;
  teamName: string | null;
  modules: ModuleProgress[];
  topics: Map<string, string | null>;
}) {
  const current = suggestedModule(modules);
  const completed = modules.filter((m) => m.completed).length;
  return (
    <>
      <section className="flex flex-col gap-2 rounded-[20px] border border-accent-line bg-accent-bg p-[18px]">
        <p className="text-sm text-muted">{teamName ? `${teamName} · ` : ""}Din modulplan</p>
        <h2 className="text-xl font-bold">{courseName}</h2>
        <p className="text-[15px]">
          <b data-testid="student-modules-completed">{completed}</b> af {modules.length} moduler afsluttet
        </p>
        {current && (
          <p className="text-sm">
            Nu: <b>Modul {current.number}</b>
          </p>
        )}
      </section>

      <ol className="flex flex-col gap-2" data-testid="student-modules">
        {modules.map((m) => (
          <li key={m.id}>
            <details className={`rounded-[18px] border bg-surface ${m.completed ? "border-ok/30" : "border-line"}`} open={m.id === current?.id}>
              <summary className="flex cursor-pointer list-none flex-col gap-0.5 px-4 py-3">
                <b>
                  Modul {m.number} – {m.name} {m.completed && <span className="text-ok">✓</span>}
                </b>
                <span className="text-[13px] text-muted">
                  {progressText(m)}
                  {m.startedOn && ` · startet ${formatDate(m.startedOn)}`}
                </span>
                {m.completed && <span className="text-[13px] text-ok">{completionText(m.completed, formatDate)}</span>}
              </summary>
              {topics.get(m.id) && (
                <ul className="flex flex-col gap-0.5 border-t border-line px-4 py-3 text-[14px]">
                  {topics
                    .get(m.id)!
                    .split("\n")
                    .map((line, k) => (
                      <li key={k} className={line.startsWith("Afsnit") ? "font-semibold" : "pl-3"}>
                        {line}
                      </li>
                    ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}
