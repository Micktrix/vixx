"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { formatDate } from "@/lib/dates";
import { isCheckable, lengthText, lessonLabel, lessonLines, modulesToComplete, type LessonSignoff, type SchoolLesson } from "@/lib/lesson-plan";
import type { ModuleProgress } from "@/lib/module-progress";
import { recordLessonScan } from "./actions";

const check = "size-[20px] shrink-0 accent-accent";
const primary =
  "flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60";

type Lesson = SchoolLesson & { done: LessonSignoff | null };

// Scanning med skolens lektionsplan (trin E10): læreren vælger lektionen (Vixx foreslår den næste), fjerner
// fluebenet ved punkter, der ikke blev gennemført, og bekræfter. Afslutter lektionen et modul, vises erklæringen og
// teorien for netop det modul; læreren behøver ikke tænke i moduler.
export function LessonScanForm({
  token,
  studentId,
  lessons,
  modules,
  theoryAtScan,
}: {
  token: string;
  studentId: string;
  lessons: Lesson[];
  modules: ModuleProgress[];
  theoryAtScan: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(recordLessonScan);
  const open = lessons.filter((l) => !l.done);
  const next = open.find((l) => l.kind !== "kta") ?? open[0];
  const [chosenIds, setChosenIds] = useState<string[]>(next ? [next.id] : []);
  const [dark, setDark] = useState(false);
  const [kta, setKta] = useState(false);
  const [declared, setDeclared] = useState(false);
  const chosen = open.filter((l) => chosenIds.includes(l.id));
  const completing = modulesToComplete(modules, chosen, { dark, kta, theoryAtScan });
  const needDark = chosen.some((l) => l.kind === "dark");
  const needKta = chosen.some((l) => l.kind === "kta");
  const blocked = !chosen.length || (needDark && !dark) || (needKta && !kta) || (completing.length > 0 && !declared);
  const names = chosen.map((l) => l.title.replace("Lektion ", "")).join(" og ");

  const toggle = (id: string, on: boolean) => {
    setChosenIds((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
    setDeclared(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" data-testid="lesson-scan">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />
      {completing.map((m) => (
        <input key={m.id} type="hidden" name="complete" value={m.number} />
      ))}

      <fieldset className="flex flex-col gap-1.5 rounded-[20px] border border-line bg-surface p-4" data-testid="lesson-list">
        <legend className="sr-only">Lektion</legend>
        {lessons.map((l) =>
          l.done ? (
            <div key={l.id} className="px-3 py-1 text-[15px]">
              <b>{lessonLabel(l)}</b> <span className="text-ok">✓</span>
              <span className="block text-[13px] text-ok">
                {formatDate(l.done.lesson_date)} · {l.done.instructor_name}
              </span>
            </div>
          ) : (
            <div key={l.id} className={`rounded-[14px] border ${chosenIds.includes(l.id) ? "border-accent bg-accent-bg" : "border-line"}`}>
              <label className="flex items-center gap-3 px-3 py-2.5">
                <input type="checkbox" name="lesson" value={l.id} checked={chosenIds.includes(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} className={check} />
                <span>
                  <b>{lessonLabel(l)}</b>
                  {l.id === next?.id && <span className="text-[13px] font-semibold text-accent-ink"> · næste</span>}
                  <span className="block text-[13px] text-muted">
                    {lengthText(l)}
                    {l.control && ` · ${l.control}`}
                  </span>
                </span>
              </label>
              {chosenIds.includes(l.id) && (
                <div className="flex flex-col gap-1 border-t border-accent-line bg-surface px-3 py-2.5" data-testid="lesson-items">
                  {l.kind === "normal" && lessonLines(l.items).some(isCheckable) && (
                    <p className="text-[13px] font-semibold">Fjern fluebenet ved det, der ikke blev gennemført:</p>
                  )}
                  {lessonLines(l.items).map((line) =>
                    isCheckable(line) && l.kind === "normal" ? (
                      <label key={line} className="flex items-start gap-2.5 px-1.5 py-0.5 text-[14px]">
                        <input type="hidden" name="item" value={line} />
                        <input type="checkbox" name="itemDone" value={line} defaultChecked className={`${check} mt-0.5`} />
                        {line}
                      </label>
                    ) : (
                      <p key={line} className="px-1.5 py-0.5 text-[14px] text-muted">
                        {line}
                      </p>
                    ),
                  )}
                  {l.kind === "dark" && (
                    <label className="mt-1 flex items-start gap-2.5 rounded-lg border border-accent-line bg-accent-bg px-2 py-1.5 text-[14px] font-semibold">
                      <input type="checkbox" name="darkConfirm" checked={dark} onChange={(e) => setDark(e.target.checked)} className={`${check} mt-0.5`} />
                      <span>
                        Ja, kørt i mørke
                        <span className="block text-[12px] font-normal text-muted">Din underskrift sættes på mørkekørslen.</span>
                      </span>
                    </label>
                  )}
                  {l.kind === "kta" && (
                    <label className="mt-1 flex items-start gap-2.5 rounded-lg border border-accent-line bg-accent-bg px-2 py-1.5 text-[14px] font-semibold">
                      <input type="checkbox" name="ktaConfirm" checked={kta} onChange={(e) => setKta(e.target.checked)} className={`${check} mt-0.5`} />
                      Ja, kørt på køreteknisk anlæg
                    </label>
                  )}
                  {l.note && <p className="px-1.5 text-[12px] text-muted">{l.note}</p>}
                </div>
              )}
            </div>
          ),
        )}
      </fieldset>


      {completing.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[20px] border border-ok/30 bg-ok-bg p-4" data-testid="lesson-completes">
          {completing.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <b className="text-[17px]">
                {names ? `Lektion ${names} afslutter modul ${m.number}.` : `Modul ${m.number} afsluttes.`}
              </b>
              {!theoryAtScan && (
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  Teorilektioner i modul {m.number}
                  <input name={`theory_${m.number}`} type="number" min={m.min_theory} max={100} defaultValue={m.min_theory} required className={inputClass} />
                </label>
              )}
            </div>
          ))}
          <label className="flex items-start gap-2.5 text-[15px]">
            <input type="checkbox" name="declaration" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className={`${check} mt-0.5`} />
            Jeg erklærer, at eleven har opnået de nødvendige kompetencer og opfylder målene i undervisningsplanen for modulet.
          </label>
          <p className="text-[13px] text-muted">Dato, dit navn og din underskrift kommer på modulplanen. Afslutningen kan ikke fortrydes.</p>
        </section>
      )}

      <button type="submit" disabled={pending || blocked} className={primary}>
        {pending ? "Gemmer …" : chosen.length ? `Bekræft lektion ${names}` : "Vælg lektionen"}
      </button>
      {completing.length > 0 && !declared && <p className="text-[13px] font-semibold text-accent-ink">Sæt flueben ved erklæringen.</p>}
      <ResultBox state={state} />
      <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Tælles i elevens lektionsplan. Timen til lønnen registrerer du som altid i kalenderen.</p>
    </form>
  );
}
