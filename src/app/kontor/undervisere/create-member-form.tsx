"use client";

import { useActionState, useState } from "react";
import { CheckChip, Fieldset, ResultBox, TextField } from "@/components/form";
import { primaryButtonClass } from "@/components/styles";
import { createMember } from "./actions";

type Option = { value: string; label: string };

export function CreateMemberForm({
  canGrantOffice,
  guest: initialGuest,
  categories,
  lessonTypes,
}: {
  canGrantOffice: boolean;
  guest: boolean;
  categories: Option[];
  lessonTypes: Option[];
}) {
  const [state, action, pending] = useActionState(createMember, undefined);
  const [teaches, setTeaches] = useState(true);
  const [guest, setGuest] = useState(initialGuest);

  if (state && "message" in state) {
    // Efter oprettelse vises kun svaret, så koden ikke forsvinder ved en fejlklik.
    return <ResultBox state={state} />;
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Navn" name="fullName" required autoComplete="off" />
        <TextField
          label="Telefonnummer"
          name="phone"
          type="tel"
          required
          placeholder="12 34 56 78"
          hint="Bliver brugernavn ved login."
        />
      </div>

      <Fieldset
        legend="Roller"
        hint={
          canGrantOffice
            ? "Vælg en eller flere. Admin kan alt, kontoret kan, og derudover priser, ydelser og kontorbrugere."
            : "Kun admin kan give adgang til kontoret."
        }
      >
        {canGrantOffice && <CheckChip name="roles" value="admin" label="Admin" />}
        {canGrantOffice && <CheckChip name="roles" value="office" label="Kontor" />}
        <label className="cursor-pointer">
          <input
            type="checkbox"
            name="roles"
            value="instructor"
            checked={teaches}
            onChange={(e) => setTeaches(e.target.checked)}
            className="peer sr-only"
          />
          <span className="inline-flex h-9 items-center rounded-full border border-line2 bg-surface px-3.5 text-sm font-semibold text-muted peer-checked:border-accent peer-checked:bg-accent-bg peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
            Lærer
          </span>
        </label>
      </Fieldset>

      {teaches && (
        <>
          <label className="flex items-center gap-2.5 text-[15px] font-semibold">
            <input
              type="checkbox"
              name="isGuest"
              checked={guest}
              onChange={(e) => setGuest(e.target.checked)}
              className="size-[18px] accent-accent"
            />
            Gæstelærer (ekstern, afregnes via faktura)
          </label>

          {guest && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Firma / køreskole (valgfri)" name="guestCompany" />
              <TextField
                label="Aktiv til (valgfri)"
                name="activeUntil"
                type="date"
                hint="Efter datoen kan gæsten ikke logge ind eller planlægges."
              />
            </div>
          )}

          <Fieldset legend="Kategorier">
            {categories.map((c) => (
              <CheckChip key={c.value} name="categories" value={c.value} label={c.label} />
            ))}
          </Fieldset>

          <Fieldset legend="Typer" hint="Bruges, når kontoret søger efter en ledig underviser.">
            {lessonTypes.map((t) => (
              <CheckChip key={t.value} name="lessonTypes" value={t.value} label={t.label} defaultChecked />
            ))}
          </Fieldset>
        </>
      )}

      <div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Opretter …" : "Opret og lav midlertidig kode"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}
