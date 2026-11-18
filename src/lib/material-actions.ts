"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Vidensbanken: mapper (kun admin) og materialer (lærere og kontor). Databasen afgør adgangen (RLS); filerne
// lægges op og hentes via tidsbegrænsede links, som serveren laver efter tjekket.

const BUCKET = "materials";
const MAX_BYTES = 50 * 1024 * 1024;
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/kontor/materialer");
  revalidatePath("/laerer/materialer");
}

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (error.code === "23505") return { error: "Der findes allerede en mappe med det navn." };
  if (error.code === "23514") return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at ændre dette." };
  return { error: fallback };
}

// --- Mapper (admin) ---

export async function saveFolder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Skriv mappens navn." };
  if (name.length > 60) return { error: "Navnet er for langt." };
  const values = {
    name,
    parent_id: text(formData, "parentId") || null,
    ...(id ? { active: formData.get("active") === "on" } : {}),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("material_folders").update(values).eq("id", id).eq("school_id", membership.schoolId)
    : await supabase.from("material_folders").insert({ ...values, school_id: membership.schoolId });
  const failed = dbError(error, "Mappen kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  refresh();
  return { message: id ? "Mappen er gemt." : `Mappen "${name}" er oprettet.` };
}

export async function deleteFolder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("material_folders").delete().eq("id", text(formData, "id"));
  const failed = dbError(error, "Mappen kunne ikke slettes.");
  if (failed) return failed;
  refresh();
  return undefined;
}

// --- Materialer ---

async function member() {
  const { membership } = await requireRole(["admin", "office", "instructor"]);
  return { schoolId: membership.schoolId, supabase: await createClient() };
}

export async function addLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await member();
  const title = text(formData, "title");
  const url = text(formData, "url");
  if (!title) return { error: "Skriv en titel." };
  if (!/^https?:\/\//i.test(url)) return { error: "Skriv et link, der starter med https://" };
  const { error } = await supabase.from("materials").insert({
    school_id: schoolId,
    folder_id: text(formData, "folderId") || null,
    title,
    description: text(formData, "description") || null,
    kind: "link",
    url,
  });
  const failed = dbError(error, "Linket kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  refresh();
  return { message: "Linket er gemt." };
}

// Trin 1 af en upload: materialet oprettes (ikke klar endnu), og browseren får et link at lægge filen op til.
export async function prepareUpload(input: {
  title: string;
  description: string;
  folderId: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<{ error: string } | { id: string; signedUrl: string }> {
  const { schoolId, supabase } = await member();
  const title = input.title.trim();
  if (!title) return { error: "Skriv en titel." };
  if (!input.fileName) return { error: "Vælg en fil." };
  if (input.size > MAX_BYTES) return { error: "Filen er for stor. Højst 50 MB. Læg videoer op som et link (fx YouTube)." };
  const safeName = input.fileName.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-100) || "fil";
  const id = randomUUID();
  const path = `${schoolId}/${id}/${safeName}`;
  const { error } = await supabase.from("materials").insert({
    id,
    school_id: schoolId,
    folder_id: input.folderId || null,
    title,
    description: input.description.trim() || null,
    kind: "file",
    storage_path: path,
    file_name: input.fileName.slice(0, 200),
    mime_type: input.mimeType.slice(0, 120) || null,
    size_bytes: input.size,
  });
  const failed = dbError(error, "Filen kunne ikke gemmes. Prøv igen.");
  if (failed) return failed as { error: string };
  const { data, error: signError } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (signError || !data) {
    await supabase.from("materials").delete().eq("id", id);
    return { error: "Filen kunne ikke lægges op. Prøv igen." };
  }
  return { id, signedUrl: data.signedUrl };
}

// Trin 2: filen er lagt op. Serveren tjekker, at den findes, og så er materialet klar.
export async function finishUpload(id: string): Promise<ActionState> {
  const { supabase } = await member();
  const { data: material } = await supabase.from("materials").select("storage_path").eq("id", id).maybeSingle();
  if (!material?.storage_path) return { error: "Materialet findes ikke." };
  const [folder, name] = [material.storage_path.split("/").slice(0, -1).join("/"), material.storage_path.split("/").at(-1)];
  const { data: files } = await createAdminClient().storage.from(BUCKET).list(folder, { search: name });
  if (!files?.some((f) => f.name === name)) return { error: "Filen blev ikke lagt op. Prøv igen." };
  const { error } = await supabase.from("materials").update({ ready: true }).eq("id", id);
  if (error) return { error: "Filen kunne ikke gemmes. Prøv igen." };
  refresh();
  return { message: "Filen er lagt op." };
}

// Flyt et materiale til en mappe (del med skolen) eller tilbage til "Mine materialer" (kun ejeren).
export async function moveMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await member();
  const folderId = text(formData, "folderId") || null;
  const { data, error } = await supabase.from("materials").update({ folder_id: folderId }).eq("id", text(formData, "id")).select("id");
  const failed = dbError(error, "Materialet kunne ikke flyttes. Prøv igen.");
  if (failed) return failed;
  if (!data?.length) return { error: "Du har ikke adgang til at flytte dette materiale." };
  refresh();
  return { message: folderId ? "Materialet er delt i mappen." : "Materialet er flyttet til Mine materialer." };
}

export async function deleteMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await member();
  const { data, error } = await supabase.from("materials").delete().eq("id", text(formData, "id")).select("storage_path");
  const failed = dbError(error, "Materialet kunne ikke slettes.");
  if (failed) return failed;
  if (!data?.length) return { error: "Du har ikke adgang til at slette dette materiale." };
  if (data[0].storage_path) await createAdminClient().storage.from(BUCKET).remove([data[0].storage_path]);
  refresh();
  return undefined;
}
