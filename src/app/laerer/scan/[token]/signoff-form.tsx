"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { ServiceOptions, type ServiceOption } from "@/components/service-options";
import { inputClass } from "@/components/styles";
import { fromMinutes, planSlotIsFree, planSpan, suggestPlanStart, type LessonPlan, type Span } from "@/lib/schedule";
import { signOffLesson } from "./actions";

// Teori vælges som "lektionen" THEORY og tælles op med et antal lektioner.
export const THEORY = "theory";

export type SignoffLesson = { id: string; number: string; kind: "driving" | "theory"; lesson_count: number; content: string | null };

const box = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4";
const check = "size-[20px] shrink-0 accent-accent";

// Vælg lektionen, sæt flueben ved det, der ikke blev nået, og kvittér. En kørselslektion registreres
// til lønnen i samme tryk (kan fravælges). Teori kommer ikke med på lønnen.
export function SignoffForm({
  token,
  studentId,
  lessons,
  services,
  defaultServiceId,
  plan,
  busy,
  planned,
  defaultStart,
  demo,
  theory,
}: {
  token: string;
  studentId: string;
  lessons: SignoffLesson[];
  services: ServiceOption[];
  defaultServiceId: string;
  plan: LessonPlan;
  busy: Span[];
  planned: { id: string; label: string }[]; // dagens planlagte lektioner, der ikke er registreret
  defaultStart: string;
  demo: boolean; // admins demo-elev: kommer aldrig på lønnen
  theory: { done: number; total: number } | null; // forløbets teori, hvis det har teori
}) {
  const { state, onSubmit, pending } = useFormAction(signOffLesson);
  const choices: SignoffLesson[] = [
    ...(theory ? [{ id: THEORY, number: "Teori", kind: "theory" as const, lesson_count: 2, content: null }] : []),
    ...lessons,
  ];
  const [lessonId, setLessonId] = useState(lessons[0]?.id ?? THEORY);
  const lesson = choices.find((l) => l.id === lessonId) ?? choices[0];
  const isTheory = lesson.id === THEORY;
  const [pay, setPay] = useState(true);
  const [scheduledId, setScheduledId] = useState(planned[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [count, setCount] = useState<number | null>(null);
  const [start, setStart] = useState(defaultStart);

  const shownCount = count ?? lesson.lesson_count;
  const shownStart = start && planSlotIsFree(plan, start, shownCount, busy) ? start : (suggestPlanStart(plan, shownCount, busy) ?? "");
  const span = shownStart ? planSpan(plan, shownStart, shownCount) : null;
  const items = (lesson.content ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const registers = lesson.kind === "driving" && pay;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />

      <fieldset className={box}>
        <legend className="sr-only">Lektion</legend>
        <span className="text-sm font-bold">Hvilken lektion?</span>
        <div className="flex flex-col gap-1.5">
          {choices.map((l) => (
            <label
              key={l.id}
              className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${l.id === lessonId ? "border-accent bg-accent-bg" : "border-line"}`}
            >
              <input type="radio" name="courseLessonId" value={l.id} checked={l.id === lessonId} onChange={() => setLessonId(l.id)} className={check} />
              {l.id === THEORY ? (
                <span>
                  <b>Teori</b>
                  <span className="block text-[13px] text-muted">
                    {theory!.done} af {theory!.total} lektioner · tæller op
                  </span>
                </span>
              ) : (
                <span>
                  <b>Lektion {l.number}</b>
                  <span className="block text-[13px] text-muted">
                    {l.lesson_count} × 45 min. · {l.kind === "theory" ? "Teori" : "Kørsel"}
                  </span>
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {items.length > 0 && (
        <fieldset className={box} key={lesson.id}>
          <legend className="sr-only">Ikke nået</legend>
          <span className="text-sm font-bold">
            Punkter, der ikke blev nået <span className="font-normal text-muted">(valgfrit)</span>
          </span>
          {items.map((item) => (
            <label key={item} className="flex items-start gap-3 text-[15px]">
              <input type="checkbox" name="skipped" value={item} className={`${check} mt-0.5`} />
              {item}
            </label>
          ))}
        </fieldset>
      )}

      {isTheory && (
        <section className={box}>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Antal teorilektioner
            <select name="theoryCount" defaultValue="2" className={inputClass}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[13px] text-muted">Teori kommer ikke med på lønnen herfra. Registrér selv timerne i kalenderen.</p>
        </section>
      )}

      {isTheory ? null : demo ? (
        <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Demo-elev: lektionen kommer ikke på lønnen.</p>
      ) : lesson.kind === "theory" ? (
        <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Teori kommer ikke med på lønnen herfra. Registrér selv timerne i kalenderen.</p>
      ) : (
        <section className={box}>
          <label className="flex items-center gap-3 text-[15px] font-bold">
            <input type="checkbox" name="pay" checked={pay} onChange={(e) => setPay(e.target.checked)} className={check} />
            Registrér til løn
          </label>
          {registers && planned.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Lektion i dit skema i dag
              <select name="scheduledLessonId" value={scheduledId} onChange={(e) => setScheduledId(e.target.value)} className={inputClass}>
                {planned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="">Ikke planlagt – vælg tid</option>
              </select>
            </label>
          )}
          {registers && !(planned.length > 0 && scheduledId) && (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Ydelse
                <select name="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required className={inputClass}>
                  <option value="" disabled>
                    Vælg ydelse
                  </option>
                  <ServiceOptions services={services} />
                </select>
              </label>
              <div className="flex items-end gap-3">
                <label className="flex flex-1 flex-col gap-1.5 text-sm font-bold">
                  Start
                  <select name="start" value={shownStart} onChange={(e) => setStart(e.target.value)} required className={inputClass}>
                    {!shownStart && <option value="">Ingen ledig tid</option>}
                    {plan.starts.map((t) => {
                      const free = planSlotIsFree(plan, t, shownCount, busy);
                      return (
                        <option key={t} value={t} disabled={!free}>
                          {t}
                          {free ? "" : " – optaget"}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="flex w-24 flex-col gap-1.5 text-sm font-bold">
                  Antal
                  <select name="count" value={shownCount} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {span && (
                <p className="text-[13px] text-muted">
                  {fromMinutes(span.from)}–{fromMinutes(span.to)} · sendes til godkendelse som de andre timer
                </p>
              )}
            </>
          )}
        </section>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? "Kvitterer …" : isTheory ? "Kvittér for teori" : `Kvittér for lektion ${lesson.number}`}
      </button>
      <ResultBox state={state} />
    </form>
  );
}
