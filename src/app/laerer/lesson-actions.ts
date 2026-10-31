"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput, todayDk } from "@/lib/dates";
import { TIME_SLOTS } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Registrering (kørt lektion) og egen planlægning fra lærer-appen.
// Databasen sikrer: kun egne data, ikke frem i tiden (registrering), ingen overlap, kompetence, låst periode.

function readLesson(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const date = parseDateInput(text("date"));
  const start = text("start");
  const count = Number(text("count"));
  if (!date) return { error: "Ugyldig dato." } as const;
  if (!text("serviceId")) return { error: "Vælg en ydelse." } as const;
  if (!TIME_SLOTS.includes(start)) return { error: "Vælg et starttidspunkt." } as const;
  if (!Number.isInteger(count) || count < 1 || count > 20) return { error: "Antal lektioner skal være mellem 1 og 20." } as const;
  return {
    id: text("id") || null,
    values: {
      lesson_date: date,
      start_time: start,
      lesson_count: count,
      service_id: text("serviceId"),
      category_code: text("category") || null,
      student_name: text("studentName") || null,
      note: text("note") || null,
    },
  } as const;
}

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23P01", "23514", "23505"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at ændre dette." };
  return { error: fallback };
}

async function ownInstructor() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructors")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .single();
  return { user, membership, supabase, instructorId: data?.id as string };
}

function done(date: string): never {
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  redirect(`/laerer?dag=${date}`);
}

export async function saveRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const read = readLesson(formData);
  if ("error" in read) return { error: read.error as string };
  if (read.values.lesson_date > todayDk()) return { error: "Du kan kun registrere lektioner for i dag eller tidligere." };
  const { user, membership, supabase, instructorId } = await ownInstructor();

  // En rettet registrering sendes altid til godkendelse igen. Databasen sikrer det for lærere; status
  // sættes også her, så det gælder for en admin, der underviser og retter sin egen lektion.
  const { error } = read.id
    ? await supabase.from("registrations").update({ ...read.values, status: "pending" }).eq("id", read.id).neq("status", "approved")
    : await supabase.from("registrations").insert({
        ...read.values,
        school_id: membership.schoolId,
        instructor_id: instructorId,
        created_by: user.id,
      });
  const failed = dbError(error, "Lektionen kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  done(read.values.lesson_date);
}

export async function deleteRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .select("lesson_date");
  const failed = dbError(error, "Registreringen kunne ikke slettes.");
  if (failed) return failed;
  if (!data?.length) return { error: "Kun registreringer, der afventer, kan slettes." };
  done(data[0].lesson_date);
}

export async function saveOwnLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const read = readLesson(formData);
  if ("error" in read) return { error: read.error as string };
  if (read.values.lesson_date <= todayDk()) return { error: "Egne lektioner kan kun planlægges frem i tiden." };
  const { user, membership, supabase, instructorId } = await ownInstructor();

  const { data, error } = read.id
    ? await supabase
        .from("scheduled_lessons")
        .update(read.values)
        .eq("id", read.id)
        .eq("origin", "instructor")
        .select("id, lesson_minutes")
        .single()
    : await supabase
        .from("scheduled_lessons")
        .insert({
          ...read.values,
          school_id: membership.schoolId,
          instructor_id: instructorId,
          origin: "instructor",
          created_by: user.id,
        })
        .select("id, lesson_minutes")
        .single();
  const failed = dbError(error, "Lektionen kunne ikke planlægges. Prøv igen.");
  if (failed) return failed;

  // Bil eller lokale til lektionen. Bookingen følger lektionen, når den flyttes (databasen).
  const resourceId = String(formData.get("resourceId") ?? "").trim() || null;
  const { data: existing } = await supabase.from("bookings").select("id, resource_id").eq("scheduled_lesson_id", data!.id).maybeSingle();
  let bookingError: { code?: string; message: string } | null = null;
  if (existing && !resourceId) {
    ({ error: bookingError } = await supabase.from("bookings").delete().eq("id", existing.id));
  } else if (existing && existing.resource_id !== resourceId) {
    ({ error: bookingError } = await supabase.from("bookings").update({ resource_id: resourceId }).eq("id", existing.id));
  } else if (!existing && resourceId) {
    ({ error: bookingError } = await supabase.from("bookings").insert({
      school_id: membership.schoolId,
      resource_id: resourceId,
      booking_date: read.values.lesson_date,
      start_time: read.values.start_time,
      minutes: read.values.lesson_count * data!.lesson_minutes,
      instructor_id: instructorId,
      scheduled_lesson_id: data!.id,
      created_by: user.id,
    }));
  }
  if (bookingError) {
    // En ny lektion uden den ønskede bil/lokale fortrydes, så intet halvt bliver liggende.
    if (!read.id) await supabase.from("scheduled_lessons").delete().eq("id", data!.id);
    return dbError(bookingError, "Bil eller lokale kunne ikke bookes. Prøv igen.");
  }
  done(read.values.lesson_date);
}
