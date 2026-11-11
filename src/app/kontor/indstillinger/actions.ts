"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Lokaler og køretøjer: kontoret og admin. Ubrugte kan slettes, brugte kun slås fra.
function readName(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Skriv et navn." } as const;
  if (name.length > 60) return { error: "Navnet er for langt." } as const;
  return { name } as const;
}

export async function addResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "room" && kind !== "vehicle") return { error: "Vælg lokale eller køretøj." };
  const values = readName(formData);
  if ("error" in values) return { error: values.error as string };

  const supabase = await createClient();
  const { error } = await supabase.from("resources").insert({ school_id: membership.schoolId, kind, name: values.name });
  if (error?.code === "23505") return { error: `"${values.name}" findes allerede.` };
  if (error) return { error: "Det kunne ikke oprettes. Prøv igen." };
  revalidatePath("/kontor", "layout");
  return { message: `${values.name} er oprettet.` };
}

export async function updateResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const values = readName(formData);
  if ("error" in values) return { error: values.error as string };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .update({ name: values.name, active: formData.get("active") === "on" })
    .eq("id", id)
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `"${values.name}" findes allerede.` };
  if (error || !data?.length) return { error: "Det kunne ikke gemmes. Prøv igen." };
  revalidatePath("/kontor", "layout");
  return { message: "Gemt." };
}

export async function deleteResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .select("name");
  if (error?.code === "23503") return { error: error.message };
  if (error || !data?.length) return { error: "Det kunne ikke slettes. Prøv igen." };
  revalidatePath("/kontor", "layout");
  return { message: `${data[0].name} er slettet.` };
}

// Skolens indstillinger. Kun admin (RLS: "Admin retter egen skole").
// Lektionslængden gælder nye lektioner; eksisterende beholder deres længde.
export async function updateSchool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  const minutes = Number(formData.get("lessonMinutes"));
  const startDay = Number(formData.get("payPeriodStartDay"));
  if (!name) return { error: "Skriv skolens navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) return { error: "Lektionslængden skal være mellem 15 og 240 minutter." };
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) return { error: "Lønperioden skal starte mellem den 1. og den 28." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .update({ name, lesson_minutes: minutes, pay_period_start_day: startDay })
    .eq("id", membership.schoolId)
    .select("id");
  if (error || !data?.length) return { error: "Indstillingerne kunne ikke gemmes. Prøv igen." };
  revalidatePath("/", "layout");
  return { message: "Skolens indstillinger er gemt." };
}
