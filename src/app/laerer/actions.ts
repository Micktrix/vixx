"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Lærerens egne handlinger. RLS og databasens regler sikrer, at læreren kun ændrer sit eget,
// ikke registrerer frem i tiden, ikke overlapper og ikke ændrer i en låst lønperiode.

function refresh() {
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
}

// Fjern en planlagt lektion fra lektionsplanen/EU (uden ydelse). RLS afgør, hvem der må.
export async function deletePlannedLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_lessons")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .is("service_id", null)
    .select("id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke fjernes." };
  refresh();
  revalidatePath("/elev", "layout");
  return { message: "Lektionen er fjernet." };
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
