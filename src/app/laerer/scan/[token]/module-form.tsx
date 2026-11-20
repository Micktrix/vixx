"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { lessonItems, progressText, type ModuleProgress } from "@/lib/module-progress";
import { countModuleLessons } from "./actions";

const box = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4";
const check = "size-[20px] shrink-0 accent-accent";

// Modulforløb: vælg modul (Vixx foreslår), teori eller kørsel (evt. i mørke) og antal. Det tælles i modulet;
// timen til lønnen registrerer læreren som altid i kalenderen.
export function ModuleForm({
  token,
  studentId,
  modules,
  suggestedId,
  manualGearModules = [],
}: {
  token: string;
  studentId: string;
  modules: ModuleProgress[];
  suggestedId: string;
  manualGearModules?: string[]; // moduler, hvor kørsel kan markeres "manuelt gear" (kode 78)
}) {
  const { state, onSubmit, pending } = useFormAction(countModuleLessons);
  const [moduleId, setModuleId] = useState(suggestedId);
  const [kind, setKind] = useState<"theory" | "driving">("driving");
  const [lessonIds, setLessonIds] = useState<string[]>([]);
  const current = modules.find((m) => m.id === moduleId);
  // Skolens kørelektioner i modulet, som eleven mangler.
  const openLessons = (current?.lessons ?? []).filter((l) => !l.doneOn).map((l) => l.lesson);
  const chosen = openLessons.filter((l) => lessonIds.includes(l.id));
  const byLesson = kind === "driving" && chosen.length > 0;
  // Punkter, eleven mangler i modulet (ikke kørt hos en tidligere lærer), og om alle punkter er kørt.
  const missingTopics = new Set((current?.notDriven ?? []).filter((n) => !n.lesson).map((n) => n.item));
  const topicsDone = !!current && current.driving > 0 && missingTopics.size === 0 && !current.reached;
  const toggle = (id: string) => setLessonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />

      <fieldset className={box}>
        <legend className="sr-only">Modul</legend>
        <span className="text-sm font-bold">Hvilket modul?</span>
        <div className="flex flex-col gap-1.5">
          {modules.map((m) => (
            <label
              key={m.id}
              className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${m.id === moduleId ? "border-accent bg-accent-bg" : "border-line"}`}
            >
              <input
                type="radio"
                name="moduleId"
                value={m.id}
                checked={m.id === moduleId}
                onChange={() => {
                  setModuleId(m.id);
                  setLessonIds([]);
                }}
                className={check}
              />
              <span>
                <b>Modul {m.number}</b>
                {m.id === suggestedId && <span className="text-[13px] font-semibold text-accent-ink"> · foreslået</span>}
                <span className="block text-[13px] text-muted">
                  {progressText(m)}
                  {m.reached && " · minimum nået"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className={box}>
        <span className="text-sm font-bold">Teori eller kørsel?</span>
        <div className="grid grid-cols-2 gap-2">
          {(["theory", "driving"] as const).map((k) => (
            <label
              key={k}
              className={`flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 font-semibold ${k === kind ? "border-accent bg-accent-bg" : "border-line"}`}
            >
              <input type="radio" name="kind" value={k} checked={k === kind} onChange={() => setKind(k)} className={check} />
              {k === "theory" ? "Teori" : "Kørsel"}
            </label>
          ))}
        </div>
        {kind === "driving" && openLessons.length > 0 && (
          <fieldset className="flex flex-col gap-1.5" data-testid="scan-lesson-choice">
            <legend className="mb-1 text-sm font-bold">Hvilken lektion?</legend>
            {openLessons.map((l) => (
              <div key={l.id} className={`rounded-[14px] border px-3 py-2.5 ${lessonIds.includes(l.id) ? "border-accent bg-accent-bg" : "border-line"}`}>
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="lesson" value={l.id} checked={lessonIds.includes(l.id)} onChange={() => toggle(l.id)} className={check} />
                  <span>
                    <b>Lektion {l.number}</b>
                    <span className="block text-[13px] text-muted">
                      {l.lesson_count} × 45 min.{l.dark ? " · i mørke" : ""}
                      {l.location ? ` · ${l.location}` : ""}
                    </span>
                  </span>
                </label>
                {lessonIds.includes(l.id) && lessonItems(l.content).length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                    <span className="text-[13px] font-semibold">Sæt kryds ved det, der IKKE blev kørt:</span>
                    {lessonItems(l.content).map((item) => (
                      <label key={item} className="flex items-start gap-2.5 text-[14px]">
                        <input type="checkbox" name={`skip:${l.id}`} value={item} className={`${check} mt-0.5`} />
                        {item}
                      </label>
                    ))}
                    {l.control_topic && <span className="text-[13px] text-muted">Kontrolstof: {l.control_topic}</span>}
                  </div>
                )}
              </div>
            ))}
            <span className="text-[13px] text-muted">Vælg ingen lektion for at tælle anden kørsel i modulet.</span>
          </fieldset>
        )}
        {kind === "driving" && !byLesson && lessonItems(current?.topics ?? null).length > 0 && (
          <fieldset className="flex flex-col gap-1 rounded-[14px] border border-line px-3 py-2.5" data-testid="scan-topics" key={moduleId}>
            <legend className="px-1 text-[13px] font-semibold">Sæt kryds ved det, der IKKE blev kørt:</legend>
            {topicsDone && (
              <p className="text-[13px] text-ok" data-testid="topics-done">
                Alle punkter er kørt. De næste lektioner er repetition, til minimum er nået.
              </p>
            )}
            {lessonItems(current?.topics ?? null).map((item) => (
              <label key={item} className="flex items-start gap-2.5 text-[14px]">
                <input type="checkbox" name="skipTopic" value={item} className={`${check} mt-0.5`} />
                <span>
                  {item}
                  {missingTopics.has(item) && <span className="ml-1.5 rounded-full bg-bad-bg px-2 text-[12px] font-semibold text-bad">mangler</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {!byLesson && (
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Antal lektioner
          <select name="count" defaultValue="2" className={inputClass}>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        )}
        {kind === "driving" && !byLesson && (
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="dark" className={check} />I mørke
          </label>
        )}
        {kind === "driving" && manualGearModules.includes(moduleId) && (
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="manualGear" className={check} />
            Manuelt gear (kode 78)
          </label>
        )}
      </section>

      <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Tælles i elevens modul. Timen til lønnen registrerer du som altid i kalenderen.</p>

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending
          ? "Gemmer …"
          : byLesson
            ? `Lektion ${chosen.map((l) => l.number).join(" + ")} er kørt`
            : `Tæl ${kind === "theory" ? "teori" : "kørsel"} i modul ${current?.number ?? ""}`}
      </button>
      <ResultBox state={state} />
    </form>
  );
}
