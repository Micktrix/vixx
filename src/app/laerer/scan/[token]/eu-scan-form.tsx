"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { formatDate } from "@/lib/dates";
import { hoursText, type EuProgress } from "@/lib/eu";
import { recordEuScan } from "./actions";

const check = "size-[20px] shrink-0 accent-accent";

// EU ved scanning (trin E9a): læreren sætter flueben ved de emner, der er gennemført, og/eller én køretime, og
// bekræfter. Dato, navn og lærerens underskrift kommer på EU-planen; eleven skriver under med kuglepen ved print.
export function EuScanForm({ token, studentId, courseName, progress }: { token: string; studentId: string; courseName: string; progress: EuProgress }) {
  const { state, onSubmit, pending } = useFormAction(recordEuScan);
  const [chosen, setChosen] = useState<string[]>([]);
  const [drive, setDrive] = useState("");
  const open = progress.topics.filter((t) => !t.done);
  const openDrives = progress.drives.filter((d) => !d.done && d.topicId);
  const count = chosen.length + (drive ? 1 : 0);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4" data-testid="eu-scan">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <b className="text-[17px]">{courseName}</b>
        <span className="block text-[13px] text-muted">
          {hoursText(progress.hoursDone)} af {hoursText(progress.hoursTotal)} · {progress.driveLessons} køretimer á 45 min.
        </span>
      </div>

      {open.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[13px] font-semibold">Gennemførte emner – sæt flueben:</legend>
          {open.map((t) => (
            <label key={t.id} className="flex items-start gap-2.5 px-1.5 py-0.5 text-[14px]">
              <input
                type="checkbox"
                name="topic"
                value={t.id}
                checked={chosen.includes(t.id)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))}
                className={`${check} mt-0.5`}
              />
              <span>
                <b>{t.code}</b> {t.goal} <span className="text-muted">· {hoursText(t.hours)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Køretime
        <select name="drive" value={drive} onChange={(e) => setDrive(e.target.value)} className={inputClass}>
          <option value="">Ingen køretime</option>
          {openDrives.map((d) => (
            <option key={d.topicId} value={d.topicId!}>
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
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? "Gemmer …" : count ? `Bekræft EU (${count})` : "Vælg emner eller en køretime"}
      </button>
      <ResultBox state={state} />
      <p className="text-[13px] text-muted">Dato, dit navn og din underskrift kommer på EU-planen. Eleven skriver under med kuglepen, når planen printes.</p>

      {progress.topics.some((t) => t.done) || progress.drives.some((d) => d.done) ? (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-semibold text-muted">Bekræftet indtil nu</summary>
          <ul className="mt-1 flex flex-col gap-0.5 text-ok">
            {progress.topics
              .filter((t) => t.done)
              .map((t) => (
                <li key={t.id}>
                  ✓ {t.code} · {formatDate(t.done!.signed_on)} · {t.done!.instructor_name}
                </li>
              ))}
            {progress.drives
              .filter((d) => d.done)
              .map((d) => (
                <li key={d.done!.id}>
                  ✓ {d.title} ({d.lessons} × 45 min.) · {formatDate(d.done!.signed_on)} · {d.done!.instructor_name}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </form>
  );
}
