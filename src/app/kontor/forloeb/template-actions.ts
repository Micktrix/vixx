"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { detectFieldMap, missingFields, type FieldMap } from "@/lib/modulplan/field-map";
import { readTemplatePdf, TEMPLATE_BUCKET } from "@/lib/modulplan/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Modulplanens PDF-versioner (trin E8, del 6c-1). Kun admin (RLS håndhæver det også). Admin lægger en ny version
// op, Vixx genkender felterne, admin retter feltkortet, ser et prøvetryk og tager versionen i brug.

const PAGE = "/kontor/forloeb";
const MAX_BYTES = 20 * 1024 * 1024;

export async function prepareTemplateUpload(input: { courseId: string; version: string; size: number; type: string }) {
  const { membership } = await requireRole(["admin"]);
  const version = input.version.trim();
  if (!version || version.length > 20) return { error: "Skriv versionen, fx 1.2." };
  if (input.type !== "application/pdf") return { error: "Vælg Færdselsstyrelsens udfyldbare PDF." };
  if (input.size > MAX_BYTES) return { error: "PDF'en er for stor. Højst 20 MB." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("module_plan_templates").select("id").eq("course_id", input.courseId).eq("version", version).maybeSingle();
  if (existing) return { error: `Version ${version} findes allerede.` };
  const path = `${membership.schoolId}/${input.courseId}/${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient().storage.from(TEMPLATE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "PDF'en kunne ikke lægges op. Prøv igen." };
  return { path, signedUrl: data.signedUrl };
}

// PDF'en er lagt op: læs felterne, genkend dem og gem versionen som kladde med feltkortet.
export async function finishTemplateUpload(input: { courseId: string; version: string; path: string }): Promise<ActionState | { id: string }> {
  const { user, membership } = await requireRole(["admin"]);
  if (!input.path.startsWith(`${membership.schoolId}/${input.courseId}/`)) return { error: "PDF'en kunne ikke gemmes." };
  const admin = createAdminClient();
  const file = await readTemplatePdf({ builtin: null, storage_path: input.path });
  let map: FieldMap;
  try {
    const doc = await PDFDocument.load(file ?? new Uint8Array());
    if (!doc.getForm().getFields().length) throw new Error("ingen felter");
    map = detectFieldMap(doc);
  } catch {
    await admin.storage.from(TEMPLATE_BUCKET).remove([input.path]);
    return { error: "Filen er ikke en udfyldbar modulplan. Brug den digitale udgave fra Færdselsstyrelsen." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("module_plan_templates")
    .insert({
      school_id: membership.schoolId,
      course_id: input.courseId,
      version: input.version.trim(),
      storage_path: input.path,
      field_map: map,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    await admin.storage.from(TEMPLATE_BUCKET).remove([input.path]);
    return { error: error?.code === "23505" ? "Versionen findes allerede." : "Versionen kunne ikke gemmes. Prøv igen." };
  }
  revalidatePath(`${PAGE}/${input.courseId}`);
  return { id: data.id };
}

// Feltkortet fra siden "Feltkort": et valg pr. oplysning ("student.name", "modules.2.end" …). Listerne
// (undervisende kørelærere og repetition) beholder det, Vixx har genkendt.
export async function saveFieldMap(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const id = String(formData.get("templateId") ?? "");
  const supabase = await createClient();
  const { data: t } = await supabase.from("module_plan_templates").select("field_map, activated_at, course_id").eq("id", id).maybeSingle();
  if (!t) return { error: "Versionen findes ikke." };
  if (t.activated_at) return { error: "En version i brug kan ikke ændres." };
  const map = (t.field_map ?? { student: {}, school: {}, teachers: [], modules: {}, repetitions: [] }) as FieldMap;
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("f:")) continue;
    const value = String(raw) || undefined;
    const [group, a, b] = key.slice(2).split(".");
    if (group === "student" || group === "school") (map[group] as Record<string, string | undefined>)[a] = value;
    if (group === "modules") map.modules[a] = { ...(map.modules[a] ?? {}), [b]: value };
  }
  const { error } = await supabase.from("module_plan_templates").update({ field_map: map }).eq("id", id);
  if (error) return { error: "Feltkortet kunne ikke gemmes. Prøv igen." };
  revalidatePath(`${PAGE}/${t.course_id}`, "layout");
  return { message: "Feltkortet er gemt." };
}

// Tag versionen i brug: nye elever på forløbet får den. Kræver at de vigtigste felter er sat.
export async function activateTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const id = String(formData.get("templateId") ?? "");
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("module_plan_templates")
    .select("field_map, activated_at, course_id, courses(course_modules(number))")
    .eq("id", id)
    .maybeSingle();
  if (!t) return { error: "Versionen findes ikke." };
  if (t.activated_at) return { error: "Versionen er allerede i brug." };
  const numbers = ((t.courses as unknown as { course_modules: { number: number }[] } | null)?.course_modules ?? []).map((m) => m.number);
  if (!numbers.length) return { error: "Forløbet har ingen moduler endnu. Opret modulerne først." };
  const missing = missingFields(t.field_map as FieldMap, numbers);
  if (missing.length) return { error: `Disse felter mangler: ${missing.join(", ")}.` };
  const { error } = await supabase.from("module_plan_templates").update({ activated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Versionen kunne ikke tages i brug. Prøv igen." };
  revalidatePath(`${PAGE}/${t.course_id}`, "layout");
  redirect(`${PAGE}/${t.course_id}`);
}

// Slet en kladde (en version i brug kan ikke slettes).
export async function deleteTemplateDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("module_plan_templates")
    .delete()
    .eq("id", String(formData.get("templateId") ?? ""))
    .select("course_id, storage_path");
  if (error?.code === "23514") return { error: error.message };
  if (error || !data?.length) return { error: "Kladden kunne ikke slettes. Prøv igen." };
  if (data[0].storage_path) await createAdminClient().storage.from(TEMPLATE_BUCKET).remove([data[0].storage_path]);
  revalidatePath(`${PAGE}/${data[0].course_id}`, "layout");
  redirect(`${PAGE}/${data[0].course_id}`);
}
