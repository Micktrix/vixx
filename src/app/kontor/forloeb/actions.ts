"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// De faste forløb og deres moduler. Kun admin retter (RLS håndhæver det også); alt logges i ændringsloggen.
// Forløbene er låst; modulerne og modulplanens PDF kan kun rettes, når admin har låst op (databasen tjekker det).

const PAGE = "/kontor/forloeb";
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// Nyt forløb fra Færdselsstyrelsens modulplan (moduler med minimum og emner). Databasen lægger modulerne ind.
// Indstillinger på et fast forløb: i brug (slået til) og "Teori registreres ved scanning".
export async function updateCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .update({
      active: formData.get("active") === "on",
      theory_at_scan: formData.get("theoryAtScan") === "on",
    })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error || !data?.length) return { error: "Forløbet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  return { message: "Forløbet er gemt." };
}

// Lås forløbet op (for at rette modulerne eller lægge en ny modulplan op) eller lås det igen. Logges.
export async function setCourseLocked(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .update({ locked: text(formData, "locked") === "1" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error || !data?.length) return { error: "Forløbet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  return undefined;
}

// Ret et modul i et modulforløb: navn, minimum og emner.
export async function updateModule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  if (!name) return { error: "Skriv modulets navn." };
  if (name.length > 120) return { error: "Navnet er for langt." };
  const num = (key: string) => Number(text(formData, key) || 0);
  const [theory, driving, dark] = [num("minTheory"), num("minDriving"), num("minDark")];
  if (![theory, driving, dark].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return { error: "Antal skal være mellem 0 og 100." };
  if (dark > driving) return { error: "Kørsel i mørke kan ikke være flere end kørsel i alt." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_modules")
    .update({
      name,
      min_theory: theory,
      min_driving: driving,
      min_dark: dark,
      topics:
        String(formData.get("topics") ?? "")
          .replace(/\r\n/g, "\n")
          .trim() || null,
      notes: text(formData, "notes") || null,
    })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("course_id, number");
  if (error?.code === "23514") return { error: error.message };
  if (error || !data?.length) return { error: "Modulet kunne ikke gemmes. Prøv igen." };
  revalidatePath(`${PAGE}/${data[0].course_id}`);
  return { message: `Modul ${data[0].number} er gemt.` };
}

type ModuleValues = {
  name: string;
  min_theory: number;
  min_driving: number;
  min_dark: number;
  topics: string | null;
};

function readModule(formData: FormData): { error: string } | ModuleValues {
  const name = text(formData, "name");
  if (!name) return { error: "Skriv modulets navn." };
  if (name.length > 120) return { error: "Navnet er for langt." };
  const num = (key: string) => Number(text(formData, key) || 0);
  const [theory, driving, dark] = [num("minTheory"), num("minDriving"), num("minDark")];
  if (![theory, driving, dark].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return { error: "Antal skal være mellem 0 og 100." };
  if (dark > driving) return { error: "Kørsel i mørke kan ikke være flere end kørsel i alt." };
  return {
    name,
    min_theory: theory,
    min_driving: driving,
    min_dark: dark,
    topics:
      String(formData.get("topics") ?? "")
        .replace(/\r\n/g, "\n")
        .trim() || null,
  };
}

// Nyt modul i et modulforløb (fx EU-moduler, som skolen bygger efter blanketten).
export async function addModule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readModule(formData);
  if ("error" in values) return values;
  const number = Number(text(formData, "number"));
  if (!Number.isInteger(number) || number < 1 || number > 20) return { error: "Nummeret skal være mellem 1 og 20." };
  const courseId = text(formData, "courseId");
  const supabase = await createClient();
  const { error } = await supabase.from("course_modules").insert({
    ...values,
    number,
    school_id: membership.schoolId,
    course_id: courseId,
  });
  if (error?.code === "23505") return { error: `Modul ${number} findes allerede.` };
  if (error?.code === "23514") return { error: error.message };
  if (error) return { error: "Modulet kunne ikke tilføjes. Prøv igen." };
  revalidatePath(`${PAGE}/${courseId}`);
  return { message: `Modul ${number} er tilføjet.` };
}

// Slet et modul, der ikke er brugt (tællinger og afslutninger holder modulet fast).
export async function deleteModule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_modules")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("course_id");
  if (error?.code === "23503") return { error: "Modulet er brugt og kan ikke slettes." };
  if (error?.code === "23514") return { error: error.message };
  if (error || !data?.length) return { error: "Modulet kunne ikke slettes. Prøv igen." };
  revalidatePath(`${PAGE}/${data[0].course_id}`);
  return { message: "Modulet er slettet." };
}
