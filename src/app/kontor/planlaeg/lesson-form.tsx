"use client";

import { useMemo, useState, useTransition } from "react";
import { ResultBox, TextField, useFormAction } from "@/components/form";
import { inputClass, primaryButtonClass } from "@/components/styles";
import type { ResourceInfo } from "@/lib/resources";
import { availability, formatDuration, lessonSpan, overlaps, slotIsFree, suggestStart, TIME_SLOTS, type DayInfo, type Span } from "@/lib/schedule";
import { getDay, getResourceBusy, saveLesson } from "./actions";

export type FormInstructor = { id: string; name: string; onRequest: boolean };
export type FormService = { id: string; name: string };
export type FormResource = ResourceInfo;

type Initial = {
  id?: string;
  instructorId: string;
  date: string;
  start?: string;
  count: number;
  serviceId?: string;
  studentName?: string;
  note?: string;
  resourceId?: string;
};

export function LessonForm({
  instructors,
  services,
  lessonMinutes,
  today,
  initial,
  initialDay,
  resources,
  initialResourceBusy,
}: {
  instructors: FormInstructor[];
  services: FormService[];
  lessonMinutes: number;
  today: string;
  initial: Initial;
  initialDay: DayInfo | null;
  resources: FormResource[];
  initialResourceBusy: Record<string, Span[]>; // bookinger på dagen pr. lokale/køretøj (uden denne lektions)
}) {
  const { state, onSubmit, pending: saving } = useFormAction(saveLesson);
  const [instructorId, setInstructorId] = useState(initial.instructorId);
  const [date, setDate] = useState(initial.date);
  const [count, setCount] = useState(initial.count);
  const [day, setDay] = useState<DayInfo | null>(initialDay);
  const [loadingDay, startLoading] = useTransition();
  const [start, setStart] = useState(initial.start ?? "");
  const [serviceId, setServiceId] = useState(initial.serviceId ?? "");
  const [resourceBusy, setResourceBusy] = useState(initialResourceBusy);
  const [resourceId, setResourceId] = useState(initial.resourceId ?? "");

  const instructor = instructors.find((i) => i.id === instructorId);
  const duration = count * lessonMinutes;
  const busy = useMemo(() => (day ? [...day.lessons, ...day.absences] : []), [day]);

  // Ny lærer eller dato: hent dagen (optagede tider og advarsler) fra serveren.
  function changeDay(nextInstructor: string, nextDate: string) {
    setInstructorId(nextInstructor);
    setDate(nextDate);
    if (!nextInstructor || !nextDate) return setDay(null);
    startLoading(async () => {
      const [nextDay, nextBusy] = await Promise.all([
        getDay(nextInstructor, nextDate, initial.id),
        nextDate !== date ? getResourceBusy(nextDate, initial.id) : Promise.resolve(resourceBusy),
      ]);
      setDay(nextDay);
      setResourceBusy(nextBusy);
    });
  }

  // Foreslå 08:00 eller første ledige tid, når det valgte tidspunkt ikke længere er ledigt.
  const startIsFree = start && slotIsFree(start, duration, busy);
  const shownStart = startIsFree ? start : (suggestStart(duration, busy) ?? "");

  const service = services.find((s) => s.id === serviceId);

  const check = day && shownStart ? availability(day, lessonSpan(shownStart, count, lessonMinutes)) : null;

  // Lokale eller køretøj, der er ledigt i lektionens tidsrum.
  const span = shownStart ? lessonSpan(shownStart, count, lessonMinutes) : null;
  const resourceFree = (id: string) => !span || !(resourceBusy[id] ?? []).some((b) => overlaps(b, span));
  const shownResourceId = resourceId && resourceFree(resourceId) ? resourceId : "";
  const blocked = day?.holiday === "approved";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Underviser
          <select
            name="instructorId"
            value={instructorId}
            onChange={(e) => changeDay(e.target.value, date)}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Vælg underviser
            </option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="Dato"
          name="date"
          type="date"
          required
          min={initial.id ? undefined : today}
          value={date}
          onChange={(e) => changeDay(instructorId, e.target.value)}
        />
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Antal lektioner
          <select name="count" value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "lektion" : "lektioner"} · {formatDuration(n * lessonMinutes)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Start
          <select
            name="start"
            value={shownStart}
            onChange={(e) => setStart(e.target.value)}
            required
            disabled={loadingDay}
            className={inputClass}
          >
            {TIME_SLOTS.map((t) => {
              const free = slotIsFree(t, duration, busy);
              return (
                <option key={t} value={t} disabled={!free}>
                  {t}
                  {free ? "" : " (optaget)"}
                </option>
              );
            })}
          </select>
          <span className="text-[13px] font-normal text-muted">Optagede tider kan ikke vælges.</span>
        </label>
      </div>

      {blocked && <Notice tone="bad">Underviseren har ferie denne dag og kan ikke planlægges.</Notice>}
      {!blocked && check?.warn && <Notice>Underviseren har anmodet om ferie denne dag.</Notice>}
      {!blocked && check && !check.ok && instructor?.onRequest && (
        <Notice>
          {check.why}. Underviseren står på &quot;Efter aftale&quot;. Du kan stadig planlægge, hvis det er aftalt.
        </Notice>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Ydelse
        <select
          name="serviceId"
          value={service ? serviceId : ""}
          onChange={(e) => setServiceId(e.target.value)}
          required
          className={inputClass}
        >
          <option value="" disabled>
            Vælg ydelse
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {resources.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Lokale eller køretøj (valgfri)
          <select name="resourceId" value={shownResourceId} onChange={(e) => setResourceId(e.target.value)} className={inputClass}>
            <option value="">Intet</option>
            {(["vehicle", "room"] as const).map((kind) => (
              <optgroup key={kind} label={kind === "vehicle" ? "Køretøjer" : "Lokaler"}>
                {resources
                  .filter((r) => r.kind === kind)
                  .map((r) => {
                    const free = resourceFree(r.id);
                    return (
                      <option key={r.id} value={r.id} disabled={!free}>
                        {r.name}
                        {free ? "" : " – optaget"}
                      </option>
                    );
                  })}
              </optgroup>
            ))}
          </select>
          <span className="text-[13px] font-normal text-muted">
            Fx bil til en køretime eller lokale til teori. Bookingen følger lektionen, hvis den flyttes.
          </span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Elev (valgfri)" name="studentName" defaultValue={initial.studentName} maxLength={80} />
        <TextField label="Note (valgfri)" name="note" defaultValue={initial.note} maxLength={300} />
      </div>

      <div>
        <button type="submit" disabled={saving || blocked || loadingDay} className={primaryButtonClass}>
          {saving ? "Gemmer …" : initial.id ? "Gem ændringer" : "Planlæg lektion"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}

function Notice({ tone = "accent", children }: { tone?: "accent" | "bad"; children: React.ReactNode }) {
  return (
    <p
      role="note"
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${
        tone === "bad" ? "border-bad/30 bg-bad-bg text-bad" : "border-accent-line bg-accent-bg"
      }`}
    >
      {children}
    </p>
  );
}
