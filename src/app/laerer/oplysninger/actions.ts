"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { CONTACT_FIELDS, KIN_FIELDS, readFields } from "@/lib/instructor-fields";
import { createAdminClient } from "@/lib/supabase/admin";
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

// Nyt hemmeligt kalender-link: det gamle holder op med at virke. Serveren skriver linket, fordi læreren
// ikke selv må rette sit lærerkort ud over kontaktoplysningerne.
export async function newCalendarLink(): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const { error } = await createAdminClient()
    .from("instructors")
    .update({ calendar_token: crypto.randomUUID() })
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id);
  if (error) return { error: "Linket kunne ikke laves om. Prøv igen." };
  revalidatePath("/laerer/oplysninger");
  return { message: "Nyt link er lavet. Tilføj kalenderen igen på din telefon." };
}
