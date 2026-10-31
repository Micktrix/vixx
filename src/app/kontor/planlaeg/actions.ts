"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput, todayDk } from "@/lib/dates";
import { TIME_SLOTS, type DayInfo } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { calendarHref } from "../calendar/params";
import { dayInfo, loadSchedule } from "../schedule-data";

// Lærerens dag til planlægningsformularen: optagede tider og advarsler.
export async function getDay(instructorId: string, date: string, ignoreLessonId?: string): Promise<DayInfo | null> {
  const { membership } = await requireRole(["admin", "office"]);
  if (!parseDateInput(date)) return null;
  const schedule = await loadSchedule(membership.schoolId, date, date);
  const instructor = schedule.instructors.find((i) => i.id === instructorId);
  return instructor ? dayInfo(schedule, instructor, date, ignoreLessonId) : null;
}

// Fejl fra databasens regler (overlap, kompetence, kategori) er skrevet til brugeren.
function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (error.code === "23P01" || error.code === "23514") return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at ændre dette." };
  return { error: fallback };
}

export async function saveLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();

  const id = text("id") || null;
  const instructorId = text("instructorId");
  const date = parseDateInput(text("date"));
  const start = text("start");
  const count = Number(text("count"));
  const serviceId = text("serviceId");
  const category = text("category") || null;

  if (!instructorId) return { error: "Vælg en underviser." };
  if (!date) return { error: "Vælg en dato." };
  if (!id && date < todayDk()) return { error: "Nye lektioner kan kun planlægges fra i dag og frem." };
  if (!TIME_SLOTS.includes(start)) return { error: "Vælg et starttidspunkt." };
  if (!Number.isInteger(count) || count < 1 || count > 20) return { error: "Antal lektioner skal være mellem 1 og 20." };
  if (!serviceId) return { error: "Vælg en ydelse." };

  const values = {
    instructor_id: instructorId,
    lesson_date: date,
    start_time: start,
    lesson_count: count,
    service_id: serviceId,
    category_code: category,
    student_name: text("studentName") || null,
    note: text("note") || null,
  };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase
      .from("scheduled_lessons")
      .update(values)
      .eq("id", id)
      .eq("school_id", membership.schoolId)
      .select("id");
    const failed = dbError(error, "Lektionen kunne ikke gemmes. Prøv igen.");
    if (failed) return failed;
    if (!data?.length) return { error: "Lektionen findes ikke længere." };
  } else {
    const { error } = await supabase
      .from("scheduled_lessons")
      .insert({ ...values, school_id: membership.schoolId, origin: "office", created_by: user.id });
    const failed = dbError(error, "Lektionen kunne ikke planlægges. Prøv igen.");
    if (failed) return failed;
  }

  revalidatePath("/kontor", "layout");
  redirect(calendarHref({ view: "dag", date }));
}

export async function deleteLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_lessons")
    .delete()
    .eq("id", id)
    .eq("school_id", membership.schoolId)
    .select("lesson_date");
  if (error || !data?.length) return { error: "Lektionen kunne ikke fjernes. Prøv igen." };

  revalidatePath("/kontor", "layout");
  redirect(calendarHref({ view: "dag", date: data[0].lesson_date }));
}
