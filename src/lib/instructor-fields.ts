import { parseDateInput } from "./dates";

// Lærerens stamdata. Læreren må selv rette kontakt og pårørende; resten retter kontoret.
export type FieldDef = { key: string; label: string; type: "text" | "email" | "tel" | "date"; inputMode?: "numeric" };

export const CONTACT_FIELDS: FieldDef[] = [
  { key: "email", label: "E-mail", type: "email" },
  { key: "address", label: "Adresse", type: "text" },
  { key: "postal_code", label: "Postnr.", type: "text", inputMode: "numeric" },
  { key: "city", label: "By", type: "text" },
];

export const KIN_FIELDS: FieldDef[] = [
  { key: "next_of_kin_name", label: "Navn", type: "text" },
  { key: "next_of_kin_relation", label: "Relation", type: "text" },
  { key: "next_of_kin_phone", label: "Telefon", type: "tel" },
];

export const EMPLOYMENT_FIELDS: FieldDef[] = [
  { key: "employee_number", label: "Medarbejdernr.", type: "text" },
  { key: "employed_from", label: "Ansat fra", type: "date" },
  { key: "birth_date", label: "Fødselsdato", type: "date" },
  { key: "instructor_license_expires", label: "Kørelærergodkendelse udløber", type: "date" },
];

// Læser felterne fra en formular. Tomme felter bliver null.
export function readFields(
  formData: FormData,
  fields: FieldDef[],
): { values: Record<string, string | null> } | { error: string } {
  const values: Record<string, string | null> = {};
  for (const f of fields) {
    const raw = String(formData.get(f.key) ?? "").trim();
    if (!raw) {
      values[f.key] = null;
      continue;
    }
    if (raw.length > 200) return { error: `${f.label} er for lang.` };
    if (f.type === "date") {
      const date = parseDateInput(raw);
      if (!date) return { error: `${f.label} er ikke en gyldig dato.` };
      values[f.key] = date;
    } else if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { error: "Skriv en gyldig e-mailadresse." };
    } else {
      values[f.key] = raw;
    }
  }
  return { values };
}
