"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { TEMPLATE_BUCKET } from "@/lib/modulplan/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// EU-forløbene (trin E9b): admin retter emner og køretimer og lægger skolens nye blanket op, når forløbet er låst op.
// Databasen håndhæver admin og "låst op" (RLS og guard_course_locked).

const MAX_BYTES = 20 * 1024 * 1024;
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(courseId: string, error: { code?: string; message: string } | null, message: string): ActionState {
  if (error?.code === "23514") return { error: error.message.includes("låst") ? error.message : "Tjek felterne." };
  if (error?.code === "23503") return { error: "Emnet er bekræftet på en elev og kan ikke slettes. Ret det i stedet." };
  if (error?.code === "23505") return { error: "Rækkefølgen er brugt. Vælg et andet nummer." };
  if (error) return { error: "Kunne ikke gemmes. Prøv igen." };
  revalidatePath(`/kontor/forloeb/${courseId}`);
  revalidatePath("/kontor/elever", "layout");
  return { message };
}

// Opret eller ret et emne (kind = topic) eller en køretime (kind = drive).
export async function saveEuTopic(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const courseId = text(formData, "courseId");
  const id = text(formData, "id");
  const kind = text(formData, "kind") === "drive" ? "drive" : "topic";
  const code = text(formData, "code");
  const sort = Number(text(formData, "sort"));
  const hoursRaw = text(formData, "hours").replace(",", ".");
  const lessons = Number(text(formData, "lessons"));
  if (!code || code.length > 80) return { error: kind === "drive" ? "Skriv køretimens emne." : "Skriv emnets nummer, fx 1.2." };
  if (!Number.isInteger(sort) || sort < 1 || sort > 200) return { error: "Skriv rækkefølgen som et tal." };
  const hours = hoursRaw === "" ? null : Number(hoursRaw);
  if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 500)) return { error: "Antal lektioner skal være et tal." };
  if (kind === "drive" && (!Number.isInteger(lessons) || lessons < 1 || lessons > 20)) return { error: "Vælg antal × 45 min." };
  const row =
    kind === "topic"
      ? { code, sort, goal: text(formData, "goal") || null, description: text(formData, "description") || null, hours }
      : { code, sort, lessons };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("eu_topics").update(row).eq("id", id)
    : await supabase.from("eu_topics").insert({ ...row, kind, school_id: membership.schoolId, course_id: courseId });
  return done(courseId, error, id ? "Gemt." : "Tilføjet.");
}

export async function deleteEuTopic(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const courseId = text(formData, "courseId");
  const supabase = await createClient();
  const { error } = await supabase.from("eu_topics").delete().eq("id", text(formData, "id"));
  return done(courseId, error, "Slettet.");
}

// Skolens nye EU-blanket: filen sendes direkte til lageret og gemmes som version.
export async function prepareEuPdfUpload(input: { courseId: string; size: number; type: string }) {
  const { membership } = await requireRole(["admin"]);
  if (input.type !== "application/pdf") return { error: "Vælg en PDF." };
  if (input.size > MAX_BYTES) return { error: "PDF'en er for stor. Højst 20 MB." };
  const path = `${membership.schoolId}/eu/${input.courseId}/${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient().storage.from(TEMPLATE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "PDF'en kunne ikke lægges op. Prøv igen." };
  return { path, signedUrl: data.signedUrl };
}

export async function finishEuPdfUpload(input: { courseId: string; path: string; fileName: string }): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  if (!input.path.startsWith(`${membership.schoolId}/eu/${input.courseId}/`)) return { error: "PDF'en kunne ikke gemmes." };
  const supabase = await createClient();
  const { error } = await supabase.from("eu_plan_files").insert({
    school_id: membership.schoolId,
    course_id: input.courseId,
    file_name: input.fileName.slice(0, 200) || "EU-blanket.pdf",
    storage_path: input.path,
  });
  if (error) {
    await createAdminClient().storage.from(TEMPLATE_BUCKET).remove([input.path]);
    return { error: error.message.includes("låst") ? error.message : "PDF'en kunne ikke gemmes. Prøv igen." };
  }
  revalidatePath(`/kontor/forloeb/${input.courseId}`);
  return { message: "Blanketten er lagt op." };
}
