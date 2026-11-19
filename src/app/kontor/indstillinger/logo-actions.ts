"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { LOGO_BUCKET, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/school-logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Skolens logo. Kun admin. Filen lægges op i to trin som materialerne: serveren laver et tidsbegrænset
// upload-link, browseren lægger filen op, og serveren gemmer stien på skolen og sletter det gamle logo.

export async function prepareLogoUpload(input: { type: string; size: number }): Promise<{ error: string } | { path: string; signedUrl: string }> {
  const { membership } = await requireRole(["admin"]);
  if (membership.role !== "admin") return { error: "Kun admin kan skifte logo." };
  const ext = LOGO_TYPES[input.type];
  if (!ext) return { error: "Logoet skal være PNG, JPEG eller WebP." };
  if (input.size > LOGO_MAX_BYTES) return { error: "Logoet er for stort. Højst 1 MB." };
  const path = `${membership.schoolId}/logo-${randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(LOGO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Logoet kunne ikke lægges op. Prøv igen." };
  return { path, signedUrl: data.signedUrl };
}

export async function finishLogoUpload(path: string): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  if (!path.startsWith(`${membership.schoolId}/logo-`)) return { error: "Logoet kunne ikke gemmes." };
  const admin = createAdminClient();
  const name = path.split("/")[1];
  const { data: files } = await admin.storage.from(LOGO_BUCKET).list(membership.schoolId, { search: name });
  if (!files?.some((f) => f.name === name)) return { error: "Logoet blev ikke lagt op. Prøv igen." };
  return saveLogoPath(membership.schoolId, path);
}

export async function removeLogo(): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  return saveLogoPath(membership.schoolId, null);
}

async function saveLogoPath(schoolId: string, path: string | null): Promise<ActionState> {
  const supabase = await createClient();
  const { data: before } = await supabase.from("schools").select("logo_path").eq("id", schoolId).single();
  const { data, error } = await supabase.from("schools").update({ logo_path: path }).eq("id", schoolId).select("id");
  if (error || !data?.length) return { error: "Logoet kunne ikke gemmes. Prøv igen." };
  if (before?.logo_path && before.logo_path !== path) await createAdminClient().storage.from(LOGO_BUCKET).remove([before.logo_path]);
  revalidatePath("/", "layout");
  return { message: path ? "Logoet er gemt." : "Logoet er fjernet." };
}
