"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Kvittering for en lektion i elevens forløb (kørelærerens underskrift). Den gælder kun forløbet; timen til
// lønnen registrerer læreren i kalenderen (lektioner og timer er adskilt, aftalt 18. nov. 2026).

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
  if (courseLessonId === "theory") return signOffTheory(token, studentId, Number(text("theoryCount")));
  const skipped = formData.getAll("skipped").map(String).join("\n") || null;

  const supabase = await createClient();
  const [{ data: instructor }, { data: student }] = await Promise.all([
    supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single(),
    supabase.from("students").select("id").eq("id", studentId).eq("school_id", membership.schoolId).maybeSingle(),
  ]);
  if (!instructor || !student) return { error: "Eleven findes ikke." };

  const { error } = await supabase.from("lesson_signoffs").insert({
    school_id: membership.schoolId,
    student_id: student.id,
    course_lesson_id: courseLessonId,
    lesson_number: "", // sættes af databasen fra forløbet
    instructor_id: instructor.id,
    skipped_items: skipped,
  });
  if (error) {
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

// Teori tælles op: lærerens scanning er nok, eleven bekræfter ikke, og det går ikke til lønnen.
async function signOffTheory(token: string, studentId: string, count: number): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  if (!Number.isInteger(count) || count < 1 || count > 12) return { error: "Vælg antal teorilektioner." };
  const supabase = await createClient();
  const { data: instructor } = await supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single();
  if (!instructor) return { error: "Du har ikke adgang til at kvittere." };
  const { error } = await supabase.from("theory_signoffs").insert({
    school_id: membership.schoolId,
    student_id: studentId,
    instructor_id: instructor.id,
    lesson_count: count,
  });
  const failed = dbError(error, "Teorien kunne ikke kvitteres. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  redirect(`/laerer/scan/${token}?kvitteret=Teori`);
}
