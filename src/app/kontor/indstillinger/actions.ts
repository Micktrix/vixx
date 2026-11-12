"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { sendMail, sendSchoolBackup } from "@/lib/backup-send";
import { normalizePhone } from "@/lib/phone";
import { parsePlanStarts } from "@/lib/schedule";
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
// Lektionslængde og lektionsplan gælder nye lektioner; eksisterende beholder deres tider.
export async function updateSchool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  const minutes = Number(formData.get("lessonMinutes"));
  const startDay = Number(formData.get("payPeriodStartDay"));
  if (!name) return { error: "Skriv skolens navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) return { error: "Lektionslængden skal være mellem 15 og 240 minutter." };
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) return { error: "Lønperioden skal starte mellem den 1. og den 28." };
  const starts = parsePlanStarts(String(formData.get("lessonStarts") ?? ""));
  if (!starts) return { error: "Skriv lektionsplanens starttider som fx 08:00, 08:45, 10:00." };
  const phoneInput = String(formData.get("contactPhone") ?? "").trim();
  const contactPhone = phoneInput ? normalizePhone(phoneInput) : null;
  if (phoneInput && !contactPhone) return { error: "Skriv et gyldigt telefonnummer, fx 20 45 67 89." };
  const cancelHours = Number(formData.get("cancelHours") ?? 24);
  if (!Number.isInteger(cancelHours) || cancelHours < 0 || cancelHours > 168) return { error: "Fristen for afbud skal være mellem 0 og 168 timer." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .update({
      name,
      lesson_minutes: minutes,
      pay_period_start_day: startDay,
      lesson_starts: starts,
      contact_phone: contactPhone,
      cancel_hours: cancelHours,
    })
    .eq("id", membership.schoolId)
    .select("id");
  if (error?.code === "23514") return { error: error.message }; // fx lektioner i planen, der overlapper
  if (error || !data?.length) return { error: "Indstillingerne kunne ikke gemmes. Prøv igen." };
  revalidatePath("/", "layout");
  return { message: "Skolens indstillinger er gemt." };
}

// Backup af timer på e-mail. Kun admin. Ændres adressen, får den gamle adresse besked, så en
// ændring ikke kan ske ubemærket (fx hvis en konto er overtaget).
export async function saveBackupEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Skriv en gyldig e-mailadresse." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("school_backups")
    .select("email")
    .eq("school_id", membership.schoolId)
    .maybeSingle();
  if ((before?.email ?? "") === email) return { message: "Ingen ændringer." };

  const { error } = await supabase
    .from("school_backups")
    .upsert({ school_id: membership.schoolId, email: email || null }, { onConflict: "school_id" });
  if (error) return { error: "Adressen kunne ikke gemmes. Prøv igen." };

  if (before?.email) {
    await sendMail({
      to: before.email,
      subject: `Backup-adressen for ${membership.schoolName} er ændret`,
      text:
        `${user.fullName} har ændret backup-adressen for timer i Vixx ` +
        `${email ? `til ${email}` : "og slået backuppen fra"}. Denne adresse får ikke længere backup.\n\n` +
        `Var det ikke aftalt, så kontakt skolens admin med det samme.\n\nVenlig hilsen\nVixx`,
    });
  }
  revalidatePath("/kontor/indstillinger");
  return { message: email ? `Backup sendes nu til ${email} hver nat.` : "Backuppen er slået fra." };
}

export async function sendBackupNow(): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const result = await sendSchoolBackup(membership.schoolId);
  revalidatePath("/kontor/indstillinger");
  if (result.error) return { error: result.error };
  return { message: `Backup sendt med ${result.count} registreringer.` };
}
