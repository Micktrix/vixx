"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Lærerens åbne tider og svar på elevernes anmodninger. Databasen sikrer, at læreren kun åbner tider for sig
// selv, ikke i fortiden eller når man er optaget, og kun svarer på anmodninger til egne tider.

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23P01", "23514", "23505"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at ændre dette." };
  return { error: fallback };
}

async function ownInstructor() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data } = await supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single();
  return { user, membership, supabase, instructorId: data?.id as string };
}

function refresh() {
  revalidatePath("/laerer", "layout");
  revalidatePath("/elev", "layout");
  revalidatePath("/kontor", "layout");
}

export async function openSlot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const date = parseDateInput(text(formData, "date"));
  const start = text(formData, "start");
  const count = Number(text(formData, "count"));
  if (!date) return { error: "Vælg en dato." };
  if (!start) return { error: "Vælg et starttidspunkt." };
  if (!Number.isInteger(count) || count < 1 || count > 12) return { error: "Antal lektioner skal være mellem 1 og 12." };
  const { membership, supabase, instructorId } = await ownInstructor();
  const { error } = await supabase
    .from("open_slots")
    .insert({ school_id: membership.schoolId, instructor_id: instructorId, slot_date: date, start_time: start, lesson_count: count });
  const failed = dbError(error, "Tiden kunne ikke åbnes. Prøv igen.");
  if (failed) return failed;
  refresh();
  return { message: "Tiden er åbnet. Dine elever kan nu anmode om den." };
}

export async function removeSlot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await ownInstructor();
  const { error } = await supabase.from("open_slots").delete().eq("id", text(formData, "id"));
  const failed = dbError(error, "Tiden kunne ikke fjernes. Prøv igen.");
  if (failed) return failed;
  refresh();
  return undefined;
}

// Godkend: læg en planlagt lektion med eleven i skemaet og kobl den på anmodningen. Afvis: tiden er åben igen.
export async function answerRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership, supabase, instructorId } = await ownInstructor();
  const id = text(formData, "id");
  if (formData.get("answer") !== "approve") {
    const { error } = await supabase.from("lesson_requests").update({ status: "rejected" }).eq("id", id);
    const failed = dbError(error, "Anmodningen kunne ikke afvises. Prøv igen.");
    if (failed) return failed;
    refresh();
    return { message: "Anmodningen er afvist. Tiden er åben igen." };
  }

  const serviceId = text(formData, "serviceId");
  if (!serviceId) return { error: "Vælg en ydelse." };
  const { data: request } = await supabase
    .from("lesson_requests")
    .select("id, student_id, open_slots(slot_date, start_time, lesson_count, lesson_minutes), students(profiles(full_name))")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (!request) return { error: "Anmodningen findes ikke længere." };
  const slot = request.open_slots as unknown as { slot_date: string; start_time: string; lesson_count: number; lesson_minutes: number };
  const name = (request.students as unknown as { profiles: { full_name: string } | null } | null)?.profiles?.full_name ?? null;

  const { data: lesson, error } = await supabase
    .from("scheduled_lessons")
    .insert({
      school_id: membership.schoolId,
      instructor_id: instructorId,
      service_id: serviceId,
      lesson_date: slot.slot_date,
      start_time: slot.start_time,
      lesson_count: slot.lesson_count,
      lesson_minutes: slot.lesson_minutes,
      student_id: request.student_id,
      student_name: name,
      origin: "instructor",
      created_by: user.id,
    })
    .select("id")
    .single();
  const failed = dbError(error, "Lektionen kunne ikke lægges i skemaet. Prøv igen.");
  if (failed) return failed;

  const { error: answerError } = await supabase
    .from("lesson_requests")
    .update({ status: "approved", scheduled_lesson_id: lesson!.id })
    .eq("id", id);
  if (answerError) {
    await supabase.from("scheduled_lessons").delete().eq("id", lesson!.id);
    return dbError(answerError, "Anmodningen kunne ikke godkendes. Prøv igen.");
  }
  refresh();
  return { message: `Godkendt. Lektionen med ${name ?? "eleven"} står nu i dit skema.` };
}
