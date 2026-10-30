"use client";

import { useActionState } from "react";
import { resetPassword, signOutEverywhere } from "./actions";
import { ResultBox } from "./result-box";

const button = "inline-flex h-9 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold disabled:opacity-60";

export function MemberActions({ userId, name }: { userId: string; name: string }) {
  const [resetState, resetAction, resetting] = useActionState(resetPassword, undefined);
  const [logoutState, logoutAction, loggingOut] = useActionState(signOutEverywhere, undefined);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm(`Nulstil koden for ${name}? Personen bliver logget ud.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <button type="submit" disabled={resetting} className={button}>
            Nulstil kode
          </button>
        </form>
        <form action={logoutAction}>
          <input type="hidden" name="userId" value={userId} />
          <button type="submit" disabled={loggingOut} className={button}>
            Log ud af alle enheder
          </button>
        </form>
      </div>
      <ResultBox state={resetState} />
      <ResultBox state={logoutState} />
    </div>
  );
}
