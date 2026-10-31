"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Typer (Kørsel, Teori …) vedligeholdes af admin. En type slås fra i stedet for at blive slettet,
// så lektioner og ydelser, der bruger den, bevares.

function refresh() {
  revalidatePath("/kontor/indstillinger");
  revalidatePath("/kontor/undervisere", "layout");
}

export async function addLessonType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 40) return { error: "Navnet er for langt." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lesson_types")
    .select("sort_order")
    .eq("school_id", membership.schoolId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("lesson_types")
    .insert({ school_id: membership.schoolId, name, sort_order: (last?.sort_order ?? 0) + 10 });
  if (error?.code === "23505") return { error: `Typen "${name}" findes allerede.` };
  if (error) return { error: "Typen kunne ikke oprettes. Prøv igen." };

  refresh();
  return { message: `Typen "${name}" er oprettet.` };
}

export async function updateLessonType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 40) return { error: "Navnet er for langt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_types")
    .update({ name, active })
    .eq("id", id)
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `Typen "${name}" findes allerede.` };
  if (error || !data?.length) return { error: "Typen kunne ikke gemmes. Prøv igen." };

  refresh();
  return { message: "Gemt." };
}

// Lokaler og køretøjer: kontoret og admin. Et køretøj kan have en kategori (B, C, CE …).
// Slås fra i stedet for at blive slettet, så gamle bookinger bevares.
function readResource(formData: FormData): { error: string } | { name: string; vehicle_category_code: string | null } {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 60) return { error: "Navnet er for langt." };
  return { name, vehicle_category_code: kind === "vehicle" ? category : null };
}

export async function addResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "room" && kind !== "vehicle") return { error: "Vælg lokale eller køretøj." };
  const values = readResource(formData);
  if ("error" in values) return values;

  const supabase = await createClient();
  const { error } = await supabase.from("resources").insert({ school_id: membership.schoolId, kind, ...values });
  if (error?.code === "23505") return { error: `"${values.name}" findes allerede.` };
  if (error) return { error: "Det kunne ikke oprettes. Prøv igen." };
  revalidatePath("/kontor", "layout");
  return { message: `${values.name} er oprettet.` };
}

export async function updateResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const values = readResource(formData);
  if ("error" in values) return values;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .update({ ...values, active: formData.get("active") === "on" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `"${values.name}" findes allerede.` };
  if (error || !data?.length) return { error: "Det kunne ikke gemmes. Prøv igen." };
  revalidatePath("/kontor", "layout");
  return { message: "Gemt." };
}
