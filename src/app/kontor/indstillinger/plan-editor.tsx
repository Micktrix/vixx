"use client";

import { useState } from "react";
import { buttonClass, inputClass } from "@/components/styles";
import { fromMinutes, TIME_SLOTS, toMinutes } from "@/lib/schedule";

// Lektionsplanen som blokke af lektioner i træk (to blokke i bredden), med en starttid at vælge pr. lektion
// og pausen mellem blokkene.
// Sendes som skjult felt "lessonStarts" (fx "08:00, 08:45, 10:00"), som serveren læser og databasen tjekker.
export function PlanEditor({ starts: initial, minutes }: { starts: string[]; minutes: number }) {
  const [starts, setStarts] = useState(initial);
  const sorted = [...starts].sort();

  // Lektioner i træk (uden pause imellem) står samlet i en blok, fx 1+2, 3+4 …
  const groups: number[][] = [];
  sorted.forEach((start, i) => {
    const prevEnd = i > 0 ? toMinutes(sorted[i - 1]) + minutes : null;
    if (prevEnd !== null && toMinutes(start) <= prevEnd) groups[groups.length - 1].push(i);
    else groups.push([i]);
  });

  const set = (i: number, value: string) => setStarts(sorted.map((s, k) => (k === i ? value : s)));
  const remove = (i: number) => setStarts(sorted.filter((_, k) => k !== i));
  const add = () => {
    const last = sorted[sorted.length - 1];
    const next = last ? fromMinutes(Math.min(toMinutes(last) + minutes, 22 * 60 - minutes)) : "08:00";
    setStarts([...sorted, TIME_SLOTS.includes(next) ? next : "08:00"]);
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-bold">Lektionsplan</legend>
      <input type="hidden" name="lessonStarts" value={sorted.join(", ")} />
      <div className="grid gap-2.5 sm:grid-cols-2" data-testid="plan-editor">
        {groups.map((group, g) => {
          const first = toMinutes(sorted[group[0]]);
          const last = toMinutes(sorted[group[group.length - 1]]) + minutes;
          const nextStart = groups[g + 1] ? toMinutes(sorted[groups[g + 1][0]]) : null;
          return (
            <div key={g} className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-3">
              <span className="text-[13px] font-semibold text-muted">
                {fromMinutes(first)}–{fromMinutes(last)}
              </span>
              <ul className="grid grid-cols-2 gap-2">
                {group.map((i) => {
                  const start = sorted[i];
                  const end = toMinutes(start) + minutes;
                  const next = sorted[i + 1] ? toMinutes(sorted[i + 1]) : null;
                  return (
                    <li key={`${i}-${start}`} className="flex flex-col gap-1">
                      <span className="flex items-center justify-between text-[13px] font-semibold text-muted">
                        Lektion {i + 1}
                        {sorted.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(i)}
                            aria-label={`Fjern lektion ${i + 1}`}
                            className="font-semibold text-muted hover:text-bad"
                          >
                            Fjern
                          </button>
                        )}
                      </span>
                      <select
                        aria-label={`Start på lektion ${i + 1}`}
                        value={start}
                        onChange={(e) => set(i, e.target.value)}
                        className={inputClass}
                      >
                        {TIME_SLOTS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-[13px] text-muted">til {fromMinutes(end)}</span>
                      {next !== null && next < end && (
                        <span className="text-[13px] font-semibold text-bad" role="alert">
                          Overlapper lektionen efter.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {nextStart !== null && (
                <span className="w-fit rounded-md bg-soft px-2 py-0.5 text-[13px] text-muted">Pause {nextStart - last} min</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1">
        <button type="button" onClick={add} className={buttonClass}>
          + Tilføj lektion
        </button>
      </div>
      <span className="text-[13px] font-normal text-muted">
        Man kan kun planlægge fra disse starttider, og pauserne holdes. Lektioner uden pause imellem ligger i træk.
      </span>
    </fieldset>
  );
}
