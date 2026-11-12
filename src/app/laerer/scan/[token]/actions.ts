"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Kvittering for en lektion i elevens forløb (kørelærerens underskrift). En kørselslektion registreres
// til lønnen i samme tryk: først registreringen, så kvitteringen med henvisning til den. Fejler
// kvitteringen, slettes registreringen igen, så intet halvt bliver liggende. Databasen sikrer resten.

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (error.code === "23505") return { error: "Lektionen er allerede kvitteret." };
  if (["23P01", "23514"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at kvittere for denne elev." };
  return { error: fallback };
}

export async function signOffLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const token = text("token");
  const studentId = text("studentId");
  const courseLessonId = text("courseLessonId");
  if (!courseLessonId) return { error: "Vælg lektionen." };
  const skipped = formData.getAll("skipped").map(String).join("\n") || null;

  const supabase = await createClient();
  const [{ data: instructor }, { data: student }, { data: lesson }] = await Promise.all([
    supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single(),
    supabase.from("students").select("id, is_demo, profiles(full_name)").eq("id", studentId).eq("school_id", membership.schoolId).maybeSingle(),
    supabase.from("course_lessons").select("kind").eq("id", courseLessonId).maybeSingle(),
  ]);
  if (!instructor || !student || !lesson) return { error: "Eleven eller lektionen findes ikke." };
  const studentName = (student.profiles as unknown as { full_name: string } | null)?.full_name ?? null;

  // Til lønnen: en planlagt lektion fra dagens skema præcis som planlagt, ellers den valgte tid og ydelse.
  let registrationId: string | null = null;
  if (lesson.kind === "driving" && formData.get("pay") === "on" && !student.is_demo) {
    const base = { school_id: membership.schoolId, instructor_id: instructor.id, student_id: student.id, student_name: studentName, created_by: user.id };
    const scheduledId = text("scheduledLessonId");
    let values;
    if (scheduledId) {
      const { data: planned } = await supabase
        .from("scheduled_lessons")
        .select("id, service_id, lesson_date, start_time, lesson_count, lesson_minutes")
        .eq("id", scheduledId)
        .eq("instructor_id", instructor.id)
        .maybeSingle();
      if (!planned) return { error: "Lektionen i dit skema findes ikke længere." };
      values = { ...base, scheduled_lesson_id: planned.id, service_id: planned.service_id, lesson_date: planned.lesson_date, start_time: planned.start_time, lesson_count: planned.lesson_count, lesson_minutes: planned.lesson_minutes };
    } else {
      const count = Number(text("count"));
      if (!text("serviceId")) return { error: "Vælg en ydelse." };
      if (!text("start")) return { error: "Vælg et starttidspunkt." };
      if (!Number.isInteger(count) || count < 1 || count > 20) return { error: "Antal lektioner skal være mellem 1 og 20." };
      values = { ...base, service_id: text("serviceId"), lesson_date: todayDk(), start_time: text("start"), lesson_count: count };
    }
    const { data, error } = await supabase.from("registrations").insert(values).select("id").single();
    const failed = dbError(error, "Timen kunne ikke registreres. Prøv igen.");
    if (failed) return failed;
    registrationId = data!.id;
  }

  const { error } = await supabase.from("lesson_signoffs").insert({
    school_id: membership.schoolId,
    student_id: student.id,
    course_lesson_id: courseLessonId,
    lesson_number: "", // sættes af databasen fra forløbet
    instructor_id: instructor.id,
    skipped_items: skipped,
    registration_id: registrationId,
  });
  if (error) {
    if (registrationId) await supabase.from("registrations").delete().eq("id", registrationId);
    return dbError(error, "Lektionen kunne ikke kvitteres. Prøv igen.");
  }

  const { data: signed } = await supabase
    .from("lesson_signoffs")
    .select("lesson_number")
    .eq("student_id", student.id)
    .eq("course_lesson_id", courseLessonId)
    .single();
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  redirect(`/laerer/scan/${token}?kvitteret=${encodeURIComponent(signed?.lesson_number ?? "")}`);
}
