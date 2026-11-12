"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Eleven bekræfter, at lektionen er gennemført (elevens underskrift). Databasen tjekker, at det er
// elevens egen kvittering, og at den kun bekræftes én gang.
export async function confirmSignoff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["student"]);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_signoffs")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .is("confirmed_at", null)
    .select("id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke bekræftes. Prøv igen." };
  revalidatePath("/elev", "layout");
  return { message: "Tak! Lektionen er bekræftet." };
}

function refresh() {
  revalidatePath("/elev", "layout");
  revalidatePath("/kontor/demo-elev");
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
}

// Anmod om en åben tid hos en af elevens faste lærere. Databasen tjekker, at eleven må, og at tiden er ledig.
// Demo-eleven: admin handler på elevens vegne (databasen tjekker, at det er skolens demo-elev).
async function actingStudent(formData: FormData) {
  const demo = String(formData.get("student") ?? "") || null;
  const { membership } = await requireRole(demo ? ["admin"] : ["student"]);
  return { schoolId: membership.schoolId, who: demo ? { p_student: demo } : {} };
}

export async function requestSlot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, who } = await actingStudent(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_open_slot", { p_school: schoolId, p_slot: String(formData.get("id") ?? ""), ...who });
  if (error) return { error: ["23505", "23514", "42501"].includes(error.code ?? "") ? error.message : "Tiden kunne ikke anmodes. Prøv igen." };
  refresh();
  return { message: "Anmodningen er sendt. Du får svar her i appen." };
}

// Træk en anmodning tilbage, eller meld afbud på en booket lektion inden skolens frist.
export async function cancelRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, who } = await actingStudent(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_lesson_request", { p_school: schoolId, p_request: String(formData.get("id") ?? ""), ...who });
  if (error) return { error: error.code === "23514" ? error.message : "Det lykkedes ikke. Prøv igen." };
  refresh();
  return { message: "Det er registreret." };
}

// Nyt hemmeligt kalender-link: det gamle holder op med at virke.
export async function newStudentCalendarLink(): Promise<ActionState> {
  const { user, membership } = await requireRole(["student"]);
  const { error } = await createAdminClient()
    .from("students")
    .update({ calendar_token: crypto.randomUUID() })
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id);
  if (error) return { error: "Linket kunne ikke laves om. Prøv igen." };
  revalidatePath("/elev/mere");
  return { message: "Nyt link er lavet. Tilføj kalenderen igen på din telefon." };
}
