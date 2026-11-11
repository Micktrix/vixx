"use client";

import { useState, type ReactNode } from "react";
import { ResultBox, TextField, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import type { FormAction } from "@/lib/action-state";
import type { ResourceInfo } from "@/lib/resources";
import { fromMinutes, overlaps, slotIsFree, suggestStart, TIME_SLOTS, toMinutes, type Span } from "@/lib/schedule";

type Service = { id: string; name: string };
type Resource = ResourceInfo;

// Formular til at registrere en kørt lektion eller planlægge en lektion frem i tiden.
// Bruges af lærer-appen og af kontoret, når en registrering rettes.
export function TeacherLessonForm({
  action,
  submitLabel,
  services,
  lessonMinutes,
  busy,
  hiddenFields,
  initial,
  resources,
  resourceBusy = {},
  children,
}: {
  action: FormAction;
  submitLabel: string;
  services: Service[];
  lessonMinutes: number;
  busy: Span[];
  hiddenFields: Record<string, string>;
  initial: {
    serviceId?: string;
    count?: number;
    start?: string;
    studentName?: string;
    note?: string;
    resourceId?: string;
  };
  // Lokaler og køretøjer, der kan bookes sammen med lektionen (kun ved planlægning).
  resources?: Resource[];
  resourceBusy?: Record<string, Span[]>; // bookinger på dagen pr. lokale/køretøj (uden denne lektions)
  children?: ReactNode; // ekstra felter før knappen
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [serviceId, setServiceId] = useState(initial.serviceId ?? (services.length === 1 ? services[0].id : ""));
  const [count, setCount] = useState(initial.count ?? 2);
  const [start, setStart] = useState(initial.start ?? "");
  const [resourceId, setResourceId] = useState(initial.resourceId ?? "");

  const duration = count * lessonMinutes;
  const shownStart = start && slotIsFree(start, duration, busy) ? start : (suggestStart(duration, busy) ?? "");

  // Kun ledige lokaler/køretøjer i lektionens tidsrum.
  const span = shownStart ? { from: toMinutes(shownStart), to: toMinutes(shownStart) + duration } : null;
  const resourceFree = (id: string) => !span || !(resourceBusy[id] ?? []).some((b) => overlaps(b, span));
  const shownResourceId = resourceId && resourceFree(resourceId) ? resourceId : "";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Ydelse
        <select name="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required className={inputClass}>
          <option value="" disabled>
            {services.length ? "Vælg ydelse" : "Der er ingen ydelser endnu"}
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Antal lektioner</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Færre"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="size-11 rounded-xl border border-line2 bg-surface text-xl font-bold"
          >
            −
          </button>
          <output aria-label="Antal lektioner" className="min-w-8 text-center text-xl font-bold">
            {count}
          </output>
          <button
            type="button"
            aria-label="Flere"
            onClick={() => setCount((c) => Math.min(12, c + 1))}
            className="size-11 rounded-xl border border-line2 bg-surface text-xl font-bold"
          >
            +
          </button>
          <input type="hidden" name="count" value={count} />
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Starttidspunkt
        <span className="flex items-center gap-3">
          <select name="start" value={shownStart} onChange={(e) => setStart(e.target.value)} required className={inputClass}>
            {TIME_SLOTS.map((t) => {
              const free = slotIsFree(t, duration, busy);
              return (
                <option key={t} value={t} disabled={!free}>
                  {t}
                  {free ? "" : " – optaget"}
                </option>
              );
            })}
          </select>
          {shownStart && (
            <span className="shrink-0 font-normal text-muted">
              til <b className="text-ink">{fromMinutes(toMinutes(shownStart) + duration)}</b>
            </span>
          )}
        </span>
      </label>

      {resources && resources.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Bil eller lokale (valgfri)
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
          <span className="text-[13px] font-normal text-muted">Bookes sammen med lektionen og flytter med, hvis du flytter den.</span>
        </label>
      )}

      <TextField label="Elev (valgfri)" name="studentName" defaultValue={initial.studentName} maxLength={80} placeholder="Navn eller elevnr." />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Note (valgfri)
        <textarea
          name="note"
          rows={2}
          defaultValue={initial.note}
          maxLength={300}
          placeholder="Fx elev flyttet fra tirsdag"
          className="w-full rounded-[10px] border border-line2 bg-surface px-3 py-2 font-normal"
        />
      </label>

      {children}
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? "Gemmer …" : submitLabel}
      </button>
      <ResultBox state={state} />
    </form>
  );
}
