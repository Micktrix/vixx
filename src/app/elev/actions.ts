"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

// Elevens underskrift og bekræftelser (28. nov. 2026). Kun eleven selv (databasen tjekker det).
export async function saveStudentSignature(strokes: string): Promise<ActionState> {
  const { membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("student_save_signature", { p_school: membership.schoolId, p_strokes: strokes });
  if (error) return { error: error.code === "23514" ? error.message : "Underskriften kunne ikke gemmes. Prøv igen." };
  refresh();
  return { message: "Din underskrift er gemt og låst." };
}

// "Bekræft" på en eller flere scanninger: værdierne er "lesson:<id>", "eu:<id>" eller "module:<id>".
export async function confirmScans(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["student"]);
  const items = formData.getAll("item").map(String);
  const ids = (kind: string) => items.filter((i) => i.startsWith(`${kind}:`)).map((i) => i.slice(kind.length + 1));
  if (!items.length) return { error: "Der er intet at bekræfte." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_confirm", {
    p_school: membership.schoolId,
    p_lessons: ids("lesson"),
    p_eu: ids("eu"),
    p_modules: ids("module"),
  });
  if (error) return { error: error.code === "23514" ? error.message : "Det lykkedes ikke. Prøv igen." };
  refresh();
  return { message: data === 1 ? "Bekræftet." : `${data} bekræftet.` };
}

// "Det passer ikke": læreren, der scannede, får besked. Intet bliver underskrevet.
export async function disputeScan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["student"]);
  const [kind, id] = String(formData.get("item") ?? "").split(":");
  const supabase = await createClient();
  const { error } = await supabase.rpc("student_dispute", {
    p_school: membership.schoolId,
    p_kind: kind,
    p_id: id,
    p_note: String(formData.get("note") ?? "").slice(0, 500),
  });
  if (error) return { error: error.code === "23514" ? error.message : "Det lykkedes ikke. Prøv igen." };
  refresh();
  return { message: "Tak. Din kørelærer har fået besked." };
}
