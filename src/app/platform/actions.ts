"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { authFieldsForPhone, firstPassword } from "@/lib/auth/login-identity";
import { requirePlatformOwner, SCHOOL_COOKIE } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/phone";
import { DEFAULT_PLAN, fromMinutes } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Platform-ejeren opretter skoler og deres første admin. Skolen og medlemskabet oprettes som den
// indloggede bruger (RLS tillader det kun for platform-ejeren), så det står i ændringsloggen.

// Standardplanen passer til 45 minutters lektioner. Med en anden længde lægges op til 8 lektioner i træk
// fra 08:00 (inden 22:00); skolen retter selv planen under Indstillinger.
function defaultStarts(minutes: number): string[] {
  if (minutes === DEFAULT_PLAN.minutes) return DEFAULT_PLAN.starts;
  return Array.from({ length: 8 }, (_, i) => 8 * 60 + i * minutes)
    .filter((start) => start + minutes <= 22 * 60)
    .map(fromMinutes);
}

export async function createSchool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformOwner();
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const schoolName = text("schoolName");
  const minutes = Number(text("lessonMinutes"));
  const startDay = Number(text("payPeriodStartDay"));
  const adminName = text("adminName");
  const phone = normalizePhone(text("adminPhone"));

  if (!schoolName) return { error: "Skriv skolens navn." };
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) return { error: "Lektionslængden skal være mellem 15 og 240 minutter." };
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) return { error: "Lønperioden skal starte mellem den 1. og den 28." };
  if (!adminName) return { error: "Skriv navnet på skolens admin." };
  if (!phone) return { error: "Skriv et gyldigt telefonnummer til skolens admin." };

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .insert({ name: schoolName, lesson_minutes: minutes, pay_period_start_day: startDay, lesson_starts: defaultStarts(minutes) })
    .select("id")
    .single();
  if (schoolError || !school) return { error: "Skolen kunne ikke oprettes. Prøv igen." };

  // Findes personen allerede i Vixx (fx på en anden skole), bruges den eksisterende login.
  const { data: existing } = await admin.from("profiles").select("id, full_name").eq("phone", phone).maybeSingle();
  let userId = existing?.id as string | undefined;
  let tempPassword: string | undefined;
  const undo = async () => {
    if (!existing && userId) await admin.auth.admin.deleteUser(userId);
    await admin.from("schools").delete().eq("id", school.id);
  };

  if (!userId) {
    tempPassword = firstPassword(phone);
    const { data, error } = await admin.auth.admin.createUser({ ...authFieldsForPhone(phone), password: tempPassword });
    if (error || !data.user) {
      await undo();
      return { error: "Admin-brugeren kunne ikke oprettes. Prøv igen." };
    }
    userId = data.user.id;
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: userId, full_name: adminName, phone, must_change_password: true });
    if (profileError) {
      await undo();
      return { error: "Admin-brugeren kunne ikke oprettes. Prøv igen." };
    }
  }

  const { error: memberError } = await supabase.from("school_members").insert({ school_id: school.id, user_id: userId, role: "admin" });
  if (memberError) {
    await undo();
    return { error: "Skolens admin kunne ikke tilknyttes. Prøv igen." };
  }

  revalidatePath("/platform");
  return {
    message: existing
      ? `${schoolName} er oprettet. ${existing.full_name} findes allerede i Vixx og er nu admin på skolen med sin nuværende kode.`
      : `${schoolName} er oprettet med ${adminName} som admin. Første login er telefonnummeret som både brugernavn og kode. Derefter vælger personen sin egen kode.`,
    tempPassword,
    href: "/platform",
    hrefLabel: "Til alle skoler",
  };
}

async function openAs(schoolId: string): Promise<never> {
  (await cookies()).set(SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/kontor");
}

// Gå ind på en skole, man allerede er medlem af.
export async function openSchool(formData: FormData) {
  const user = await requirePlatformOwner();
  const schoolId = String(formData.get("schoolId") ?? "");
  if (!user.memberships.some((m) => m.schoolId === schoolId)) redirect("/platform");
  await openAs(schoolId);
}

// Tilføj sig selv som admin på en skole for at hjælpe. Synligt for skolen og logget.
export async function joinSchool(formData: FormData) {
  const user = await requirePlatformOwner();
  const schoolId = String(formData.get("schoolId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("school_members").upsert(
    { school_id: schoolId, user_id: user.id, role: "admin", active: true },
    { onConflict: "school_id,user_id" },
  );
  if (error) redirect("/platform");
  revalidatePath("/", "layout");
  await openAs(schoolId);
}
