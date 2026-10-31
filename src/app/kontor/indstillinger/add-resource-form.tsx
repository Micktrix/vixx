"use client";

import { useState } from "react";
import { CheckChip, Fieldset, ResultBox, TextField, useFormAction } from "@/components/form";
import { primaryButtonClass } from "@/components/styles";
import { addResource } from "./actions";

// Nyt lokale eller køretøj. Et lokale får "Teori" valgt på forhånd; et køretøj vælger kategorier.
export function AddResourceForm({ categories, types }: { categories: string[]; types: { id: string; name: string }[] }) {
  const { state, onSubmit, pending } = useFormAction(addResource);
  const [kind, setKind] = useState<"room" | "vehicle">("room");

  return (
    <form
      onSubmit={onSubmit}
      // Skift mellem lokale og køretøj viser de rigtige valg nedenfor.
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
      {kind === "vehicle" ? (
        <Fieldset legend="Kategorier" hint="Fx en B-bil, der også bruges til BE.">
          {categories.map((c) => (
            <CheckChip key={c} name="categories" value={c} label={c} />
          ))}
        </Fieldset>
      ) : (
        <Fieldset legend="Bruges til" hint="Lokalet tilbydes, når man planlægger en lektion af den type.">
          {types.map((t) => (
            <CheckChip key={t.id} name="lessonTypes" value={t.id} label={t.name} defaultChecked={t.name === "Teori"} />
          ))}
        </Fieldset>
      )}
      <div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Opretter …" : "Tilføj"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}
