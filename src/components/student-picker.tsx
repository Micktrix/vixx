"use client";

import { useState } from "react";
import type { StudentOption } from "@/lib/student-options";
import { inputClass } from "./styles";

const OTHER = "";

// Elev på en lektion: vælg en elev fra skolens liste (så lektionen kommer i elevens kalender), eller skriv
// et navn, hvis eleven ikke er oprettet i Vixx. Sender studentId og studentName.
export function StudentPicker({
  students,
  initialId,
  initialName,
}: {
  students: StudentOption[];
  initialId?: string | null;
  initialName?: string | null;
}) {
  const known = students.some((s) => s.id === initialId);
  const [id, setId] = useState(known ? initialId! : OTHER);
  const [name, setName] = useState(known ? "" : (initialName ?? ""));
  const chosen = students.find((s) => s.id === id);
  const mine = students.filter((s) => s.mine);
  const others = students.filter((s) => !s.mine);
  const option = (s: StudentOption) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Elev (valgfri)
        <select name="studentId" value={id} onChange={(e) => setId(e.target.value)} className={inputClass}>
          <option value={OTHER}>Ingen / ikke oprettet i Vixx</option>
          {mine.length > 0 && <optgroup label="Dine elever">{mine.map(option)}</optgroup>}
          {others.length > 0 && <optgroup label={mine.length ? "Andre elever" : "Elever"}>{others.map(option)}</optgroup>}
        </select>
      </label>
      {chosen ? (
        <>
          <input type="hidden" name="studentName" value={chosen.name} />
          <span className="text-[13px] text-muted">Lektionen kommer i elevens kalender.</span>
        </>
      ) : (
        <input
          name="studentName"
          aria-label="Elevens navn"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Navn (valgfrit), hvis eleven ikke er i Vixx"
          className={inputClass}
        />
      )}
    </div>
  );
}
