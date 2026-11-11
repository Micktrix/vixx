"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/styles";
import { saveBackupEmail, sendBackupNow } from "./actions";

// Backup-adressen er låst, indtil man trykker "Lås op", så den ikke ændres ved et uheld.
export function BackupForm({ email }: { email: string }) {
  const save = useFormAction(saveBackupEmail);
  const send = useFormAction(sendBackupNow);
  const [unlocked, setUnlocked] = useState(!email);

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          save.onSubmit(e);
          setUnlocked(false);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Backup-e-mail
          <input
            name="email"
            type="email"
            defaultValue={email}
            readOnly={!unlocked}
            placeholder="Fx kontor@koereskole.dk"
            className={`${inputClass} ${unlocked ? "" : "bg-soft text-muted"}`}
          />
        </label>
        {unlocked ? (
          <button key="save" type="submit" disabled={save.pending} className={primaryButtonClass}>
            {save.pending ? "Gemmer …" : "Gem og lås"}
          </button>
        ) : (
          // Egen key: ellers genbruger React knappen, og klikket sender formularen med det samme.
          <button key="unlock" type="button" onClick={() => setUnlocked(true)} className={buttonClass}>
            🔒 Lås op
          </button>
        )}
      </form>
      <ResultBox state={save.state} />
      {email && (
        <form onSubmit={send.onSubmit}>
          <button type="submit" disabled={send.pending} className={buttonClass}>
            {send.pending ? "Sender …" : "Send backup nu"}
          </button>
        </form>
      )}
      <ResultBox state={send.state} />
    </div>
  );
}
