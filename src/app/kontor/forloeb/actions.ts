"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Forløb (modulplaner) og deres moduler. Kun admin retter (RLS håndhæver det også); alt logges i ændringsloggen.

const PAGE = "/kontor/forloeb";
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// Nyt forløb fra Færdselsstyrelsens modulplan (moduler med minimum og emner). Databasen lægger modulerne ind.
export async function createModuleCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_module_course", {
    p_school_id: membership.schoolId,
    p_template: text(formData, "template"),
    p_name: name,
  });
  if (error?.code === "23505") return { error: `Forløbet "${name}" findes allerede.` };
  if (error || !data) return { error: "Forløbet kunne ikke oprettes. Prøv igen." };
  revalidatePath(PAGE);
  redirect(`${PAGE}/${data}`);
}

export async function updateCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  const patch: Record<string, unknown> = { name, active: formData.get("active") === "on" };
  // Et modulforløb har fast kategori og ingen teoritæller; felterne findes kun for lektionsforløb.
  if (formData.has("category")) patch.category_code = text(formData, "category");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .update(patch)
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `Forløbet "${name}" findes allerede.` };
  if (error || !data?.length) return { error: "Forløbet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  return { message: "Forløbet er gemt." };
}

export async function deleteCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", text(formData, "id")).eq("school_id", membership.schoolId);
  if (error?.code === "23503") return { error: "Forløbet er i brug og kan kun slås fra." };
  if (error) return { error: "Forløbet kunne ikke slettes. Prøv igen." };
  revalidatePath(PAGE);
  redirect(PAGE);
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
      topics: String(formData.get("topics") ?? "").replace(/\r\n/g, "\n").trim() || null,
      notes: text(formData, "notes") || null,
    })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("course_id, number");
  if (error || !data?.length) return { error: "Modulet kunne ikke gemmes. Prøv igen." };
  revalidatePath(`${PAGE}/${data[0].course_id}`);
  return { message: `Modul ${data[0].number} er gemt.` };
}

type ModuleValues = { name: string; min_theory: number; min_driving: number; min_dark: number; topics: string | null };

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
    topics: String(formData.get("topics") ?? "").replace(/\r\n/g, "\n").trim() || null,
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
  const { error } = await supabase.from("course_modules").insert({ ...values, number, school_id: membership.schoolId, course_id: courseId });
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
  if (error || !data?.length) return { error: "Modulet kunne ikke slettes. Prøv igen." };
  revalidatePath(`${PAGE}/${data[0].course_id}`);
  return { message: "Modulet er slettet." };
}

// Tomt modulforløb, fx "C/E med EU": admin bygger modulerne og lægger Færdselsstyrelsens PDF op.
export async function createEmptyModuleCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  const category = text(formData, "category");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  if (!category) return { error: "Vælg en kategori." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_empty_module_course", { p_school_id: membership.schoolId, p_category: category, p_name: name });
  if (error?.code === "23505") return { error: `Forløbet "${name}" findes allerede.` };
  if (error || !data) return { error: "Forløbet kunne ikke oprettes. Prøv igen." };
  revalidatePath(PAGE);
  redirect(`${PAGE}/${data}`);
}

// Ét "Nyt forløb": kategori, navn og modulplan (aftalt med Michael 19. nov. 2026).
//   standard = Færdselsstyrelsens modulplan 1.1 (B, C, C/E, D) med moduler og PDF
//   own      = egen modulplan (fx EU): admin bygger modulerne og lægger PDF'en op
const STANDARD_PLANS = new Set(["B", "C", "CE", "D"]);

// Kategorien er nok: Vixx henter selv Færdselsstyrelsens modulplan (B, C, C/E, D). For andre kategorier bliver det
// et tomt modulforløb, som admin bygger. Uden navn hedder forløbet fx "C – modulplan".
export async function createCourseWithPlan(prev: ActionState, formData: FormData): Promise<ActionState> {
  const category = text(formData, "category");
  if (!category) return { error: "Vælg en kategori." };
  const plan = text(formData, "plan") || "standard";
  const label = category === "CE" ? "C/E" : category;
  const data = new FormData();
  data.set("category", category);
  data.set("name", text(formData, "name") || `${label} – modulplan`);
  if (plan === "own" || !STANDARD_PLANS.has(category)) return createEmptyModuleCourse(prev, data);
  data.set("template", `${category}-1.1`);
  return createModuleCourse(prev, data);
}

// Skolens kørelektioner under modulerne (fx lektionsskemaet C + D). Kun admin.
type ModuleLessonValues = {
  number: string;
  lesson_count: number;
  dark: boolean;
  location: string | null;
  content: string | null;
  notes: string | null;
  control_topic: string | null;
};

function readModuleLesson(formData: FormData): { error: string } | ModuleLessonValues {
  const number = text(formData, "number");
  const count = Number(text(formData, "lessonCount"));
  if (!number || number.length > 20) return { error: "Skriv lektionens nummer." };
  if (!Number.isInteger(count) || count < 1 || count > 8) return { error: "Antal × 45 min. skal være mellem 1 og 8." };
  return {
    number,
    lesson_count: count,
    dark: formData.get("dark") === "on",
    location: text(formData, "location") || null,
    content: String(formData.get("content") ?? "").replace(/\r\n/g, "\n").trim() || null,
    notes: text(formData, "notes") || null,
    control_topic: text(formData, "controlTopic") || null,
  };
}

async function coursePathOfModule(supabase: Awaited<ReturnType<typeof createClient>>, moduleId: string) {
  const { data } = await supabase.from("course_modules").select("course_id").eq("id", moduleId).maybeSingle();
  return data ? `${PAGE}/${data.course_id}` : PAGE;
}

export async function addModuleLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readModuleLesson(formData);
  if ("error" in values) return { error: values.error };
  const moduleId = text(formData, "moduleId");
  const supabase = await createClient();
  const { data: last } = await supabase.from("module_lessons").select("sort_order").eq("course_module_id", moduleId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("module_lessons")
    .insert({ ...values, school_id: membership.schoolId, course_module_id: moduleId, sort_order: (last?.sort_order ?? 0) + 10 });
  if (error) return { error: "Lektionen kunne ikke tilføjes. Prøv igen." };
  revalidatePath(await coursePathOfModule(supabase, moduleId));
  return { message: `Lektion ${values.number} er tilføjet.` };
}

export async function updateModuleLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readModuleLesson(formData);
  if ("error" in values) return { error: values.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("module_lessons")
    .update({ ...values, active: formData.get("active") === "on" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("course_module_id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke gemmes. Prøv igen." };
  revalidatePath(await coursePathOfModule(supabase, data[0].course_module_id));
  return { message: `Lektion ${values.number} er gemt.` };
}

export async function deleteModuleLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("module_lessons").delete().eq("id", text(formData, "id")).eq("school_id", membership.schoolId).select("course_module_id");
  if (error?.code === "23503") return { error: "Lektionen er gennemført af en elev og kan kun slås fra." };
  if (error || !data?.length) return { error: "Lektionen kunne ikke slettes. Prøv igen." };
  revalidatePath(await coursePathOfModule(supabase, data[0].course_module_id));
  return { message: "Lektionen er slettet." };
}

// Indsæt skolens lektionsskema (C + D) under forløbets moduler. Modulfordelingen er et forslag og kan rettes.
export async function insertLessonSchedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const courseId = text(formData, "courseId");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_lesson_schedule", { p_course_id: courseId, p_template: "CD-skema" });
  if (error) return { error: "Lektionsskemaet kunne ikke indsættes. Prøv igen." };
  revalidatePath(`${PAGE}/${courseId}`);
  return { message: `${data} lektioner er indsat. Tjek, at de ligger i de rigtige moduler.` };
}
