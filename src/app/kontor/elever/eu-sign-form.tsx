"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { signEu } from "./actions";

type Topic = { id: string; code: string; goal: string | null; hours: string };
type Drive = { topicId: string; title: string; lessons: number };

// Kryds EU af fra computeren (trin E9c): gennemførte emner og evt. én køretime med valgt dato. Til når eleven fx har
// glemt telefonen; QR-scanningen er der stadig.
export function EuSignForm({ studentId, topics, drives, today }: { studentId: string; topics: Topic[]; drives: Drive[]; today: string }) {
  const { state, onSubmit, pending } = useFormAction(signEu);
  const [chosen, setChosen] = useState<string[]>([]);
  const [drive, setDrive] = useState("");
  const count = chosen.length + (drive ? 1 : 0);
  return (
    <details className="text-sm" data-testid="eu-sign">
      <summary className="cursor-pointer font-semibold text-accent-ink">Kryds EU af her (uden scanning)</summary>
      <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3 rounded-xl border border-line p-3">
        <input type="hidden" name="studentId" value={studentId} />
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Dato
          <input type="date" name="date" defaultValue={today} max={today} required className={`${inputClass} w-[180px]`} />
        </label>
        {topics.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[13px] font-semibold">Gennemførte emner:</legend>
            {topics.map((t) => (
              <label key={t.id} className="flex items-start gap-2.5 text-[14px]">
                <input
                  type="checkbox"
                  name="topic"
                  value={t.id}
                  checked={chosen.includes(t.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))}
                  className="mt-0.5 size-[18px] accent-accent"
                />
                <span>
                  <b>{t.code}</b> {t.goal} <span className="text-muted">· {t.hours}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Køretime
          <select name="drive" value={drive} onChange={(e) => setDrive(e.target.value)} className={`${inputClass} max-w-[320px]`}>
            <option value="">Ingen køretime</option>
            {drives.map((d) => (
              <option key={d.topicId} value={d.topicId}>
                {d.title} ({d.lessons} × 45 min.)
              </option>
            ))}
            <option value="other">Anden køretime …</option>
          </select>
        </label>
        {drive === "other" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[180px] flex-1 flex-col gap-1.5 text-sm font-bold">
              Emne
              <input name="driveTitle" maxLength={80} required className={inputClass} placeholder="Fx Bykørsel" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Antal × 45 min.
              <select name="driveLessons" defaultValue={2} className={inputClass}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <button
          type="submit"
          disabled={pending || count === 0}
          className="self-start rounded-[12px] border border-accent bg-accent px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
        >
          {pending ? "Gemmer …" : count ? `Bekræft EU (${count})` : "Vælg emner eller en køretime"}
        </button>
        <ResultBox state={state} />
        <p className="text-[13px] text-muted">Datoen, dit navn og din underskrift kommer på EU-planen.</p>
      </form>
    </details>
  );
}
