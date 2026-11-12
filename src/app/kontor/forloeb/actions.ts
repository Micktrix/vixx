"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { COURSE_TEMPLATES } from "@/lib/course-templates";
import { createClient } from "@/lib/supabase/server";

// Forløb og deres lektioner. Kun admin retter (RLS håndhæver det også); alt logges i ændringsloggen.

const PAGE = "/kontor/forloeb";
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  const category = text(formData, "category");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  if (!category) return { error: "Vælg en kategori." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({ school_id: membership.schoolId, name, category_code: category })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: `Forløbet "${name}" findes allerede.` };
  if (error || !data) return { error: "Forløbet kunne ikke oprettes. Prøv igen." };
  revalidatePath(PAGE);
  redirect(`${PAGE}/${data.id}`);
}

export async function updateCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .update({ name, category_code: text(formData, "category"), active: formData.get("active") === "on" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `Forløbet "${name}" findes allerede.` };
  if (error || !data?.length) return { error: "Forløbet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  return { message: "Forløbet er gemt." };
}

export async function deleteCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", text(formData, "id")).eq("school_id", membership.schoolId);
  if (error?.code === "23503") return { error: "Forløbet er i brug og kan kun slås fra." };
  if (error) return { error: "Forløbet kunne ikke slettes. Prøv igen." };
  revalidatePath(PAGE);
  redirect(PAGE);
}

type LessonValues = {
  number: string;
  kind: "driving" | "theory";
  lesson_count: number;
  location: string | null;
  content: string | null;
  notes: string | null;
  control_topic: string | null;
};

function readLesson(formData: FormData): { error: string } | LessonValues {
  const number = text(formData, "number");
  const count = Number(text(formData, "lessonCount"));
  const kind = text(formData, "kind");
  if (!number) return { error: "Skriv lektionens nummer." };
  if (number.length > 20) return { error: "Nummeret er for langt." };
  if (!Number.isInteger(count) || count < 1 || count > 20) return { error: "Antal lektioner skal være mellem 1 og 20." };
  if (kind !== "driving" && kind !== "theory") return { error: "Vælg kørsel eller teori." };
  return {
    number,
    kind,
    lesson_count: count,
    location: text(formData, "location") || null,
    content: String(formData.get("content") ?? "").replace(/\r\n/g, "\n").trim() || null,
    notes: text(formData, "notes") || null,
    control_topic: text(formData, "controlTopic") || null,
  };
}

async function nextOrder(supabase: Awaited<ReturnType<typeof createClient>>, courseId: string) {
  const { data } = await supabase
    .from("course_lessons")
    .select("sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 10;
}

export async function addLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readLesson(formData);
  if ("error" in values) return values;
  const courseId = text(formData, "courseId");
  const supabase = await createClient();
  const { error } = await supabase
    .from("course_lessons")
    .insert({ ...values, school_id: membership.schoolId, course_id: courseId, sort_order: await nextOrder(supabase, courseId) });
  if (error) return { error: "Lektionen kunne ikke tilføjes. Prøv igen." };
  revalidatePath(`${PAGE}/${courseId}`);
  return { message: `Lektion ${values.number} er tilføjet.` };
}

export async function updateLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readLesson(formData);
  if ("error" in values) return values;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_lessons")
    .update({ ...values, active: formData.get("active") === "on" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("course_id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke gemmes. Prøv igen." };
  revalidatePath(`${PAGE}/${data[0].course_id}`);
  return { message: `Lektion ${values.number} er gemt.` };
}

export async function deleteLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_lessons")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("course_id");
  if (error?.code === "23503") return { error: "Lektionen er kvitteret for og kan kun slås fra." };
  if (error || !data?.length) return { error: "Lektionen kunne ikke slettes. Prøv igen." };
  revalidatePath(`${PAGE}/${data[0].course_id}`);
  return { message: "Lektionen er slettet." };
}

// Flyt en lektion én plads op eller ned. Alle får nye numre i rækkefølgen (10, 20, 30 …).
export async function moveLesson(formData: FormData) {
  const { membership } = await requireRole(["admin"]);
  const id = text(formData, "id");
  const courseId = text(formData, "courseId");
  const step = text(formData, "dir") === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_lessons")
    .select("id, sort_order")
    .eq("course_id", courseId)
    .eq("school_id", membership.schoolId)
    .order("sort_order");
  const list = (data ?? []).map((l) => l.id);
  const i = list.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const current = new Map((data ?? []).map((l) => [l.id, l.sort_order]));
  await Promise.all(
    list
      .map((lid, k) => ({ lid, order: (k + 1) * 10 }))
      .filter(({ lid, order }) => current.get(lid) !== order)
      .map(({ lid, order }) => supabase.from("course_lessons").update({ sort_order: order }).eq("id", lid)),
  );
  revalidatePath(`${PAGE}/${courseId}`);
}

// Læg en skabelons lektioner ind i et forløb (efter de lektioner, der allerede er der).
export async function insertTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const template = COURSE_TEMPLATES.find((t) => t.id === text(formData, "template"));
  if (!template) return { error: "Vælg en skabelon." };
  const courseId = text(formData, "courseId");
  const supabase = await createClient();
  const start = await nextOrder(supabase, courseId);
  const { error } = await supabase.from("course_lessons").insert(
    template.lessons.map((l, i) => ({
      school_id: membership.schoolId,
      course_id: courseId,
      sort_order: start + i * 10,
      number: l.number,
      kind: l.kind,
      lesson_count: l.lessonCount,
      location: l.location ?? null,
      content: l.content,
      notes: l.notes ?? null,
      control_topic: l.controlTopic ?? null,
    })),
  );
  if (error) return { error: "Lektionerne kunne ikke indsættes. Prøv igen." };
  revalidatePath(`${PAGE}/${courseId}`);
  return { message: `${template.lessons.length} lektioner er indsat. Ret dem til, så de passer.` };
}
