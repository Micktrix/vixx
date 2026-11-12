"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Admins demo-elev: admin er selv eleven, så QR-kode, kvittering og bekræftelse kan vises med ét login.

export async function createDemoStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin"]);
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return { error: "Vælg et forløb." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .insert({ school_id: membership.schoolId, user_id: user.id, course_id: courseId, is_demo: true });
  if (error?.code === "23505") return { error: "Der findes allerede en demo-elev på skolen." };
  if (error) return { error: "Demo-eleven kunne ikke oprettes. Prøv igen." };
  revalidatePath("/kontor/demo-elev");
  return undefined;
}

// Start forfra: fjern demo-elevens kvitteringer (og skift evt. forløb). Kun demo-eleven; rigtige
// kvitteringer kan aldrig slettes.
export async function resetDemoStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: demo } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .eq("is_demo", true)
    .maybeSingle();
  if (!demo) return { error: "Der er ingen demo-elev." };
  const { error } = await createAdminClient().from("lesson_signoffs").delete().eq("student_id", demo.id);
  if (error) return { error: "Demo-eleven kunne ikke nulstilles. Prøv igen." };
  const courseId = String(formData.get("courseId") ?? "");
  if (courseId) await supabase.from("students").update({ course_id: courseId }).eq("id", demo.id);
  revalidatePath("/kontor/demo-elev");
  return { message: "Demo-eleven starter forfra." };
}
