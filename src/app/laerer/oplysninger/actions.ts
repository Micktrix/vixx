"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { CONTACT_FIELDS, KIN_FIELDS, readFields } from "@/lib/instructor-fields";
import { createClient } from "@/lib/supabase/server";

// Læreren retter egne kontakt- og pårørendeoplysninger. Databasen (guard-trigger) afviser alle andre felter.
export async function updateOwnDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const read = readFields(formData, [...CONTACT_FIELDS, ...KIN_FIELDS]);
  if ("error" in read) return read;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .update(read.values)
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !data?.length) return { error: "Oplysningerne kunne ikke gemmes. Prøv igen." };

  revalidatePath("/laerer", "layout");
  return { message: "Dine oplysninger er gemt." };
}
