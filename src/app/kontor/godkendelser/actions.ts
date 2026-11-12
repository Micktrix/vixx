"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { TIME_SLOTS } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { loadApprovals } from "./data";

// Databasen låser prisen og gemmer hvem/hvornår (guard_registration_decision). Her sender vi kun status.

type Supabase = Awaited<ReturnType<typeof createClient>>;

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23514", "23P01", "23505"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at ændre dette." };
  return { error: fallback };
}

function refresh() {
  revalidatePath("/kontor", "layout");
  revalidatePath("/laerer", "layout");
}

// Besked til læreren i appen (vises under Beskeder).
async function notify(supabase: Supabase, schoolId: string, instructorId: string, body: string, sentBy: string) {
  await supabase
    .from("messages")
    .insert({ school_id: schoolId, recipient_instructor_id: instructorId, kind: "notification", body, sent_by: sentBy });
}

export async function approveRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .update({ status: "approved" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .neq("status", "approved")
    .select("id");
  const failed = dbError(error, "Lektionen kunne ikke godkendes. Prøv igen.");
  if (failed) return failed;
  if (!data?.length) return { error: "Lektionen findes ikke længere eller er allerede godkendt." };
  refresh();
  return { message: "Godkendt." };
}

// "Godkend alle der matcher": afventende registreringer, der matcher skemaet (for det valgte filter).
export async function approveMatching(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const instructorId = String(formData.get("instructorId") ?? "") || null;
  const rows = (await loadApprovals(membership.schoolId, "pending", instructorId)).filter((r) => r.flag === "matcher");
  if (!rows.length) return { error: "Ingen afventende lektioner matcher skemaet." };

  const supabase = await createClient();
  let approved = 0;
  const problems: string[] = [];
  // Én ad gangen, så en låst periode eller manglende pris kun stopper den ene.
  for (const r of rows) {
    const { error } = await supabase.from("registrations").update({ status: "approved" }).eq("id", r.id).eq("status", "pending");
    if (error) problems.push(`${r.instructorName} ${formatDate(r.date)}: ${error.message}`);
    else approved++;
  }
  refresh();
  return problems.length
    ? { error: `${approved} godkendt. Ikke godkendt: ${problems.join(" ")}` }
    : { message: `${approved} lektion${approved === 1 ? "" : "er"} godkendt.` };
}

export async function rejectRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) return { error: "Skriv en kommentar til læreren." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registrations")
    .update({ status: "rejected", decision_comment: comment })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .select("instructor_id, lesson_date, services(name)");
  const failed = dbError(error, "Lektionen kunne ikke afvises. Prøv igen.");
  if (failed) return failed;
  if (!data?.length) return { error: "Lektionen findes ikke længere." };

  const r = data[0];
  const service = (r.services as unknown as { name: string } | null)?.name ?? "";
  await notify(
    supabase,
    membership.schoolId,
    r.instructor_id,
    `Kontoret afviste din registrering ${formatDate(r.lesson_date)} (${service}): ${comment.replace(/[.!]+$/, "")}. Ret den i kalenderen og send den igen.`,
    user.id,
  );
  refresh();
  return { message: "Afvist. Læreren har fået besked." };
}

// Kontoret retter en registrering. En ikke-godkendt bliver samtidig godkendt ("Ret og godkend").
export async function officeSaveRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const id = text("id");
  const count = Number(text("count"));
  const start = text("start");
  if (!text("serviceId")) return { error: "Vælg en ydelse." };
  if (!TIME_SLOTS.includes(start)) return { error: "Vælg et starttidspunkt." };
  if (!Number.isInteger(count) || count < 1 || count > 20) return { error: "Antal lektioner skal være mellem 1 og 20." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("registrations")
    .select("instructor_id, lesson_date, lesson_count, status, services(name)")
    .eq("id", id)
    .eq("school_id", membership.schoolId)
    .maybeSingle();
  if (!before) return { error: "Registreringen findes ikke længere." };

  const { error } = await supabase
    .from("registrations")
    .update({
      service_id: text("serviceId"),
      lesson_count: count,
      start_time: start,
      student_id: text("studentId") || null,
      student_name: text("studentName") || null,
      note: text("note") || null,
      status: "approved",
    })
    .eq("id", id);
  const failed = dbError(error, "Registreringen kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;

  const message = text("message");
  const service = (before.services as unknown as { name: string } | null)?.name ?? "";
  const change = before.lesson_count !== count ? ` fra ${before.lesson_count} til ${count} lek.` : "";
  await notify(
    supabase,
    membership.schoolId,
    before.instructor_id,
    `Kontoret har rettet${before.status === "approved" ? "" : " og godkendt"} din registrering ${formatDate(before.lesson_date)} (${service})${change}.${message ? ` ${message}` : ""}`,
    user.id,
  );
  refresh();
  redirect(`/kontor/godkendelser?status=approved`);
}
