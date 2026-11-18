"use client";

import { useState } from "react";
import type { StudentOption } from "@/lib/student-options";
import { inputClass } from "./styles";

// Elever på en lektion: vælg en eller flere elever fra skolens liste (fx 4 elever på køreteknisk anlæg), så
// lektionen kommer i hver elevs kalender. Elever, der ikke er i Vixx, kan skrives med navn. Sender studentIds
// (en pr. valgt elev) og studentName (fritekst).
export function StudentPicker({
  students,
  initialIds = [],
  initialName,
}: {
  students: StudentOption[];
  initialIds?: string[];
  initialName?: string | null;
}) {
  const [chosen, setChosen] = useState<string[]>(initialIds.filter((id) => students.some((s) => s.id === id)));
  const [search, setSearch] = useState("");
  const [name, setName] = useState(initialName ?? "");
  const q = search.trim().toLowerCase();
  const matches = students
    .filter((s) => !chosen.includes(s.id) && (!q || s.name.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.mine) - Number(a.mine));
  const shown = q ? matches : matches.filter((s) => s.mine);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <fieldset className="flex flex-col gap-2" data-testid="student-picker">
      <legend className="mb-1.5 text-sm font-bold">Elever (valgfri)</legend>
      {chosen.map((id) => (
        <input key={id} type="hidden" name="studentIds" value={id} />
      ))}
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-label={`Fjern ${students.find((s) => s.id === id)?.name}`}
              className="rounded-full border border-accent bg-accent-bg px-3 py-1 text-sm font-semibold text-accent-ink"
            >
              {students.find((s) => s.id === id)?.name} ×
            </button>
          ))}
        </div>
      )}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Søg elev"
        placeholder={chosen.length ? "Tilføj flere elever – søg på navn" : "Søg elev på navn"}
        className={inputClass}
      />
      {shown.length > 0 && (
        <div className="flex max-h-[180px] flex-col overflow-y-auto rounded-[10px] border border-line2">
          {!q && <span className="px-3 pt-2 text-[12px] font-semibold text-muted">Dine elever</span>}
          {shown.slice(0, 30).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                toggle(s.id);
                setSearch("");
              }}
              className="border-b border-line px-3 py-2 text-left text-[15px] last:border-b-0 hover:bg-soft"
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}
      {q && !shown.length && <span className="text-[13px] text-muted">Ingen aktive elever matcher.</span>}
      <input
        name="studentName"
        aria-label="Andre elever (navn)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        placeholder="Andre elever, der ikke er i Vixx (navn, valgfrit)"
        className={inputClass}
      />
      {chosen.length > 0 && <span className="text-[13px] font-normal text-muted">Lektionen kommer i elevernes kalender.</span>}
    </fieldset>
  );
}
