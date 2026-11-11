"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Lærerens egne handlinger. RLS og databasens regler sikrer, at læreren kun ændrer sit eget,
// ikke registrerer frem i tiden, ikke overlapper og ikke ændrer i en låst lønperiode.

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23P01", "23514", "23505"].includes(error.code ?? "")) return { error: error.message };
  return { error: fallback };
}

function refresh() {
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
}

// "Udført": registrér en planlagt lektion præcis som planlagt.
export async function markDone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("scheduled_lessons")
    .select("id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, lesson_minutes, student_name")
    .eq("id", String(formData.get("lessonId") ?? ""))
    .maybeSingle();
  if (!lesson) return { error: "Lektionen findes ikke længere." };

  const { error } = await supabase.from("registrations").insert({
    school_id: lesson.school_id,
    instructor_id: lesson.instructor_id,
    service_id: lesson.service_id,
    scheduled_lesson_id: lesson.id,
    lesson_date: lesson.lesson_date,
    start_time: lesson.start_time,
    lesson_count: lesson.lesson_count,
    lesson_minutes: lesson.lesson_minutes,
    student_name: lesson.student_name,
    created_by: user.id,
  });
  const failed = dbError(error, "Lektionen kunne ikke registreres. Prøv igen.");
  if (failed) return failed;

  refresh();
  return { message: "Registreret som planlagt." };
}

export async function deleteOwnLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_lessons")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("origin", "instructor")
    .select("id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke fjernes." };
  refresh();
  return { message: "Lektionen er fjernet." };
}

export async function deleteCanWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .select("id");
  if (error || !data?.length) return { error: "Det lykkedes ikke. Prøv igen." };
  refresh();
  return { message: "Fjernet." };
}
