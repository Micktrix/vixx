"use client";

import { useState, type ReactNode } from "react";
import { CheckChip, Fieldset, ResultBox, TextField, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import type { FormAction } from "@/lib/action-state";
import { fromMinutes, slotIsFree, suggestStart, TIME_SLOTS, toMinutes, type Span } from "@/lib/schedule";

type Service = { id: string; name: string; groupName: string; categories: string[] };

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
  children,
}: {
  action: FormAction;
  submitLabel: string;
  services: Service[];
  lessonMinutes: number;
  busy: Span[];
  hiddenFields: Record<string, string>;
  initial: { serviceId?: string; category?: string; count?: number; start?: string; studentName?: string; note?: string };
  children?: ReactNode; // ekstra felter før knappen
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [serviceId, setServiceId] = useState(initial.serviceId ?? (services.length === 1 ? services[0].id : ""));
  const [count, setCount] = useState(initial.count ?? 2);
  const [start, setStart] = useState(initial.start ?? "");

  const duration = count * lessonMinutes;
  const shownStart = start && slotIsFree(start, duration, busy) ? start : (suggestStart(duration, busy) ?? "");
  const service = services.find((s) => s.id === serviceId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Ydelse
        <select name="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required className={inputClass}>
          <option value="" disabled>
            {services.length ? "Vælg ydelse" : "Du har ingen kompetencer, der passer til en ydelse"}
          </option>
          {[...new Set(services.map((s) => s.groupName))].map((g) => (
            <optgroup key={g} label={g}>
              {services
                .filter((s) => s.groupName === g)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      {service && service.categories.length > 1 ? (
        <Fieldset legend="Kategori">
          {service.categories.map((c) => (
            <CheckChip
              key={`${service.id}-${c}`}
              type="radio"
              name="category"
              value={c}
              label={c}
              required
              defaultChecked={c === initial.category && service.id === initial.serviceId}
            />
          ))}
        </Fieldset>
      ) : (
        service && <input type="hidden" name="category" value={service.categories[0]} />
      )}

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
