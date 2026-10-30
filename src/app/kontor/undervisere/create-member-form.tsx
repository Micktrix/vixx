"use client";

import { useActionState } from "react";
import { createMember } from "./actions";
import { ResultBox } from "./result-box";

const input = "h-[42px] w-full rounded-[10px] border border-line2 bg-surface px-3";

export function CreateMemberForm({ canCreateStaff }: { canCreateStaff: boolean }) {
  const [state, action, pending] = useActionState(createMember, undefined);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Navn
          <input name="fullName" required className={`${input} font-normal`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Telefonnummer
          <input name="phone" type="tel" required placeholder="12 34 56 78" className={`${input} font-normal`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Rolle
          {canCreateStaff ? (
            <select name="role" defaultValue="instructor" className={`${input} font-normal`}>
              <option value="instructor">Lærer</option>
              <option value="office">Kontor</option>
              <option value="admin">Admin</option>
            </select>
          ) : (
            <>
              <input type="hidden" name="role" value="instructor" />
              <span className={`${input} flex items-center bg-soft font-normal`}>Lærer</span>
            </>
          )}
        </label>
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink disabled:opacity-60"
        >
          {pending ? "Opretter …" : "Opret bruger"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}
