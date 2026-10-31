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

// Slet en type, der ikke bruges af ydelser. Brugte typer kan kun slås fra.
export async function deleteLessonType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_types")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .select("name");
  if (error?.code === "23503") return { error: "Typen bruges af ydelser og kan kun slås fra." };
  if (error || !data?.length) return { error: "Typen kunne ikke slettes. Prøv igen." };
  refresh();
  return { message: `Typen "${data[0].name}" er slettet.` };
}

// Lokaler og køretøjer: kontoret og admin. Et køretøj dækker en eller flere kategorier (B, BE …);
// et lokale bruges til en eller flere typer (fx Teori). Ubrugte kan slettes, brugte kun slås fra.
type Supabase = Awaited<ReturnType<typeof createClient>>;

function readResource(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Skriv et navn." } as const;
  if (name.length > 60) return { error: "Navnet er for langt." } as const;
  return {
    name,
    categories: [...new Set(formData.getAll("categories").map(String))],
    lessonTypes: [...new Set(formData.getAll("lessonTypes").map(String))],
  } as const;
}

// Skriv kun forskellen, så ændringsloggen viser, hvad der er slået til og fra.
async function syncLinks(
  supabase: Supabase,
  schoolId: string,
  resourceId: string,
  table: "resource_categories" | "resource_lesson_types",
  column: "category_code" | "lesson_type_id",
  wanted: readonly string[],
) {
  const { data } = await supabase.from(table).select(column).eq("resource_id", resourceId);
  const had = new Set((data ?? []).map((r) => (r as Record<string, string>)[column]));
  const add = wanted.filter((v) => !had.has(v));
  const remove = [...had].filter((v) => !wanted.includes(v));
  if (add.length) {
    const { error } = await supabase.from(table).insert(add.map((v) => ({ school_id: schoolId, resource_id: resourceId, [column]: v })));
    if (error) return error;
  }
  if (remove.length) {
    const { error } = await supabase.from(table).delete().eq("resource_id", resourceId).in(column, remove);
    if (error) return error;
  }
  return null;
}

export async function addResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "room" && kind !== "vehicle") return { error: "Vælg lokale eller køretøj." };
  const values = readResource(formData);
  if ("error" in values) return { error: values.error as string };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .insert({ school_id: membership.schoolId, kind, name: values.name })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: `"${values.name}" findes allerede.` };
  if (error || !data) return { error: "Det kunne ikke oprettes. Prøv igen." };

  const linkError =
    kind === "vehicle"
      ? await syncLinks(supabase, membership.schoolId, data.id, "resource_categories", "category_code", values.categories)
      : await syncLinks(supabase, membership.schoolId, data.id, "resource_lesson_types", "lesson_type_id", values.lessonTypes);
  if (linkError) return { error: "Oprettet, men kategorier/typer kunne ikke gemmes. Prøv at rette dem." };
  revalidatePath("/kontor", "layout");
  return { message: `${values.name} er oprettet.` };
}

export async function updateResource(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const values = readResource(formData);
  if ("error" in values) return { error: values.error as string };
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .update({ name: values.name, active: formData.get("active") === "on" })
    .eq("id", id)
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `"${values.name}" findes allerede.` };
  if (error || !data?.length) return { error: "Det kunne ikke gemmes. Prøv igen." };

  const linkError =
    kind === "vehicle"
      ? await syncLinks(supabase, membership.schoolId, id, "resource_categories", "category_code", values.categories)
      : await syncLinks(supabase, membership.schoolId, id, "resource_lesson_types", "lesson_type_id", values.lessonTypes);
  if (linkError) return { error: "Kategorier/typer kunne ikke gemmes. Prøv igen." };
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
