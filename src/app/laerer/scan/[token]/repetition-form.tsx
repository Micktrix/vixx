"use client";

import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { registerRepetition } from "./actions";

// Repetitionslektioner efter ikke bestået praktisk prøve. Kun når alle moduler er afsluttet. Dato, lærer og
// underskrift sættes på modulplanen af Vixx. Kan ikke fortrydes.
export function RepetitionForm({ token, studentId }: { token: string; studentId: string }) {
  const { state, onSubmit, pending } = useFormAction(registerRepetition);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4" data-testid="repetition-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />
      <b>Repetitionslektioner</b>
      <p className="text-sm text-muted">Efter ikke bestået praktisk prøve. Dato, dit navn og din underskrift kommer på modulplanen.</p>
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
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? "Registrerer …" : "Registrér repetition"}
      </button>
      <ResultBox state={state} />
    </form>
  );
}
