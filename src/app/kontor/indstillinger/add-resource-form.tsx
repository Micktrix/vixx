"use client";

import { useState } from "react";
import { CheckChip, Fieldset, ResultBox, TextField, useFormAction } from "@/components/form";
import { primaryButtonClass } from "@/components/styles";
import { addResource } from "./actions";

// Nyt lokale eller køretøj.
export function AddResourceForm() {
  const { state, onSubmit, pending } = useFormAction(addResource);
  const [kind, setKind] = useState<"room" | "vehicle">("room");

  return (
    <form
      onSubmit={onSubmit}
      // Eksemplet i navnefeltet følger valget af lokale eller køretøj.
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        if (target.name === "kind") setKind(target.value as "room" | "vehicle");
      }}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-line2 p-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Fieldset legend="Ny">
          <CheckChip type="radio" name="kind" value="room" label="Lokale" defaultChecked />
          <CheckChip type="radio" name="kind" value="vehicle" label="Køretøj" />
        </Fieldset>
        <TextField label="Navn" name="name" required className="max-w-[240px] flex-1" placeholder={kind === "room" ? "Fx Lokale 3" : "Fx Personbil 2"} />
      </div>
      <div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Opretter …" : "Tilføj"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}
