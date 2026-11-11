"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput } from "@/lib/dates";
import { CONTACT_FIELDS, EMPLOYMENT_FIELDS, KIN_FIELDS, readFields } from "@/lib/instructor-fields";
import { parseKroner } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Alle handlinger kører som den indloggede bruger, så RLS og ændringsloggen gælder.
// RLS sikrer skolen; vi filtrerer også på den aktive skole, så man ikke ændrer en anden skoles lærer.

function refresh() {
  revalidatePath("/kontor/undervisere", "layout");
}

export async function updateInstructorDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const instructorId = String(formData.get("instructorId") ?? "");

  const read = readFields(formData, [...EMPLOYMENT_FIELDS, ...CONTACT_FIELDS, ...KIN_FIELDS]);
  if ("error" in read) return read;

  const isGuest = formData.get("isGuest") === "on";
  const untilRaw = String(formData.get("activeUntil") ?? "");
  const activeUntil = untilRaw ? parseDateInput(untilRaw) : null;
  if (untilRaw && !activeUntil) return { error: "\"Aktiv til\" er ikke en gyldig dato." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .update({
      ...read.values,
      is_guest: isGuest,
      guest_company: isGuest ? String(formData.get("guestCompany") ?? "").trim() || null : null,
      active_until: activeUntil,
    })
    .eq("id", instructorId)
    .eq("school_id", membership.schoolId)
    .select("id");

  if (error?.code === "23505") return { error: "Medarbejdernummeret er allerede i brug på skolen." };
  if (error || !data?.length) return { error: "Oplysningerne kunne ikke gemmes. Prøv igen." };
  refresh();
  return { message: "Stamdata er gemt." };
}

export async function setAvailability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const instructorId = String(formData.get("instructorId") ?? "");
  const mode = String(formData.get("availability") ?? "");
  if (mode !== "fixed" && mode !== "on_request") return { error: "Vælg tilgængelighed." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .update({ availability: mode })
    .eq("id", instructorId)
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error || !data?.length) return { error: "Det lykkedes ikke. Prøv igen." };

  refresh();
  return { message: mode === "fixed" ? "Står nu på \"Fast\"." : "Står nu på \"Efter aftale\"." };
}

// Egne priser: felter med navnet price_<ydelses-id>. Tomt felt = standardprisen. Kun admin.
export async function updateInstructorPrices(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const schoolId = membership.schoolId;
  const instructorId = String(formData.get("instructorId") ?? "");

  const wanted = new Map<string, number | null>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price_")) continue;
    const ore = parseKroner(String(value));
    if (Number.isNaN(ore)) return { error: `"${value}" er ikke et gyldigt beløb.` };
    wanted.set(key.slice("price_".length), ore);
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("instructor_prices")
    .select("service_id, amount_ore")
    .eq("instructor_id", instructorId)
    .eq("school_id", schoolId);
  const had = new Map((current ?? []).map((p) => [p.service_id, p.amount_ore]));

  const upserts = [...wanted]
    .filter(([id, ore]) => ore !== null && had.get(id) !== ore)
    .map(([id, ore]) => ({ school_id: schoolId, instructor_id: instructorId, service_id: id, amount_ore: ore as number }));
  const removals = [...wanted].filter(([id, ore]) => ore === null && had.has(id)).map(([id]) => id);

  const results = await Promise.all([
    upserts.length ? supabase.from("instructor_prices").upsert(upserts, { onConflict: "instructor_id,service_id" }) : null,
    removals.length
      ? supabase.from("instructor_prices").delete().eq("instructor_id", instructorId).in("service_id", removals)
      : null,
  ]);
  if (results.some((r) => r?.error)) return { error: "Satserne kunne ikke gemmes. Prøv igen." };

  refresh();
  return { message: upserts.length || removals.length ? "Satserne er gemt." : "Ingen ændringer." };
}
