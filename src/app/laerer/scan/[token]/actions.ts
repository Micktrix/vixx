"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Lærerens scanning af eleven: tæl lektioner i et modul, afslut et modul og registrér repetition. Det gælder kun
// elevens forløb; timen til lønnen registrerer læreren i kalenderen (lektioner og timer er adskilt, 18. nov. 2026).

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23P01", "23514"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at kvittere for denne elev." };
  return { error: fallback };
}

// Modulforløb (trin E8): teori eller kørsel tælles i det valgte modul. Lærerens scanning er nok (ingen
// elevunderskrift i modulplanen), og det går ikke til lønnen.
export async function countModuleLessons(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const token = text("token");
  const kind = text("kind");
  const count = Number(text("count"));
  if (!text("moduleId")) return { error: "Vælg modulet." };
  if (kind !== "theory" && kind !== "driving") return { error: "Vælg teori eller kørsel." };
  if (!Number.isInteger(count) || count < 1 || count > 12) return { error: "Vælg antal lektioner." };
  const supabase = await createClient();
  const { data: instructor } = await supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single();
  if (!instructor) return { error: "Du har ikke adgang til at kvittere." };
  const { error } = await supabase.from("module_signoffs").insert({
    school_id: membership.schoolId,
    student_id: text("studentId"),
    course_module_id: text("moduleId"),
    kind,
    lesson_count: count,
    dark: kind === "driving" && formData.get("dark") === "on",
    manual_gear: kind === "driving" && formData.get("manualGear") === "on",
    instructor_id: instructor.id,
  });
  const failed = dbError(error, "Lektionerne kunne ikke tælles. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  redirect(`/laerer/scan/${token}?kvitteret=Modul`);
}

// Afslut elevens modul (trin E8): erklæringen skal være sat. Databasen tjekker minimum (medmindre "Overført
// fra lektionsplan") og rækkefølgen, regner ekstra lektioner ud og gemmer dato og lærer.
export async function completeModule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  if (formData.get("declaration") !== "on") return { error: "Sæt flueben ved erklæringen." };
  if (text("selfStudy").length > 500) return { error: "Selvstudie er for langt." };
  const supabase = await createClient();
  const { data: instructor } = await supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single();
  if (!instructor) return { error: "Du har ikke adgang til at afslutte moduler." };
  const { error } = await supabase.from("module_completions").insert({
    school_id: membership.schoolId,
    student_id: text("studentId"),
    course_module_id: text("moduleId"),
    module_number: 0, // sættes af databasen fra modulet
    instructor_id: instructor.id,
    declaration: true,
    transferred: formData.get("transferred") === "on",
    self_study: text("selfStudy") || null,
  });
  if (error?.code === "23505") return { error: "Modulet er allerede afsluttet." };
  const failed = dbError(error, "Modulet kunne ikke afsluttes. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  redirect(`/laerer/scan/${text("token")}?kvitteret=Afsluttet`);
}

// Repetitionslektioner efter ikke bestået praktisk prøve (trin E8, del 5). Databasen kræver, at alle moduler
// er afsluttet, og at læreren har gemt sin underskrift, og sætter dato, navn og en kopi af underskriften på.
export async function registerRepetition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const count = Number(text("count"));
  if (!Number.isInteger(count) || count < 1 || count > 12) return { error: "Vælg antal lektioner." };
  const supabase = await createClient();
  const { data: instructor } = await supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single();
  if (!instructor) return { error: "Du har ikke adgang til at registrere repetitionslektioner." };
  const { error } = await supabase.from("repetition_lessons").insert({
    school_id: membership.schoolId,
    student_id: text("studentId"),
    lesson_count: count,
    instructor_id: instructor.id,
  });
  const failed = dbError(error, "Repetitionslektionerne kunne ikke registreres. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  redirect(`/laerer/scan/${text("token")}?kvitteret=Repetition`);
}
