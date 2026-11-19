"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { progressText, type ModuleProgress } from "@/lib/module-progress";
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
}: {
  token: string;
  studentId: string;
  modules: ModuleProgress[];
  suggestedId: string;
}) {
  const { state, onSubmit, pending } = useFormAction(countModuleLessons);
  const [moduleId, setModuleId] = useState(suggestedId);
  const [kind, setKind] = useState<"theory" | "driving">("theory");

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
              <input type="radio" name="moduleId" value={m.id} checked={m.id === moduleId} onChange={() => setModuleId(m.id)} className={check} />
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
        {kind === "driving" && (
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="dark" className={check} />I mørke
          </label>
        )}
      </section>

      <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Tælles i elevens modul. Timen til lønnen registrerer du som altid i kalenderen.</p>

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? "Tæller …" : `Tæl ${kind === "theory" ? "teori" : "kørsel"} i modul ${modules.find((m) => m.id === moduleId)?.number ?? ""}`}
      </button>
      <ResultBox state={state} />
    </form>
  );
}
