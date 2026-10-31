"use client";

import { useRouter } from "next/navigation";
import { inputClass } from "@/components/styles";

// Filter på lærer. Skifter side med det samme, så kalenderen hentes for den valgte lærer.
export function InstructorFilter({
  instructors,
  value,
  hrefFor,
}: {
  instructors: { id: string; name: string; isGuest: boolean }[];
  value: string | null;
  hrefFor: Record<string, string>; // lærer-id ("" = alle) → link
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Vis undervisere"
      value={value ?? ""}
      onChange={(e) => router.push(hrefFor[e.target.value])}
      className={`${inputClass} w-auto min-w-[200px]`}
    >
      <option value="">Alle undervisere</option>
      {instructors.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
          {i.isGuest ? " (gæst)" : ""}
        </option>
      ))}
    </select>
  );
}
