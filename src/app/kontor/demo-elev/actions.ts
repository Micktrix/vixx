"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { authFieldsForPhone } from "@/lib/auth/login-identity";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Skolens demo-elev: en fiktiv elev ("Demo Elev"), som admin bruger til at vise elevens skærm. Ingen logger
// ind som demo-eleven; admin bekræfter på elevens vegne. Den vises ikke i elevlister og kommer aldrig på lønnen.

const PAGE = "/kontor/demo-elev";

async function demoStudent(schoolId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id, user_id").eq("school_id", schoolId).eq("is_demo", true).maybeSingle();
  return data;
}

export async function createDemoStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return { error: "Vælg et forløb." };
  if (await demoStudent(membership.schoolId)) return { error: "Der findes allerede en demo-elev på skolen." };

  // Et nummer, der ikke findes i Danmark (+45 00 …), og en tilfældig kode, som ingen kender.
  const admin = createAdminClient();
  const phone = `+4500${randomInt(100000, 1000000)}`;
  const { data, error } = await admin.auth.admin.createUser({ ...authFieldsForPhone(phone), password: randomUUID() });
  if (error || !data.user) return { error: "Demo-eleven kunne ikke oprettes. Prøv igen." };
  const userId = data.user.id;
  const { error: profileError } = await admin.from("profiles").insert({ id: userId, full_name: "Demo Elev", phone });

  const supabase = await createClient();
  const { error: studentError } = profileError
    ? { error: profileError }
    : await supabase.from("students").insert({ school_id: membership.schoolId, user_id: userId, course_id: courseId, is_demo: true });
  if (studentError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: "Demo-eleven kunne ikke oprettes. Prøv igen." };
  }
  revalidatePath(PAGE);
  return undefined;
}

// Bekræft på demo-elevens vegne (elevens underskrift). Kun skolens demo-elev.
export async function confirmDemoSignoff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const demo = await demoStudent(membership.schoolId);
  if (!demo) return { error: "Der er ingen demo-elev." };
  const { data, error } = await createAdminClient()
    .from("lesson_signoffs")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("student_id", demo.id)
    .is("confirmed_at", null)
    .select("id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke bekræftes. Prøv igen." };
  revalidatePath(PAGE);
  return { message: "Tak! Lektionen er bekræftet." };
}

// Start forfra: fjern demo-elevens kvitteringer (og skift evt. forløb). Kun demo-eleven; rigtige
// kvitteringer kan aldrig slettes.
export async function resetDemoStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const demo = await demoStudent(membership.schoolId);
  if (!demo) return { error: "Der er ingen demo-elev." };
  const { error } = await createAdminClient().from("lesson_signoffs").delete().eq("student_id", demo.id);
  if (error) return { error: "Demo-eleven kunne ikke nulstilles. Prøv igen." };
  const courseId = String(formData.get("courseId") ?? "");
  if (courseId) await (await createClient()).from("students").update({ course_id: courseId }).eq("id", demo.id);
  revalidatePath(PAGE);
  return { message: "Demo-eleven starter forfra." };
}
