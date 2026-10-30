"use server";

import { revalidatePath } from "next/cache";
import { authFieldsForPhone } from "@/lib/auth/login-identity";
import { requireRole, type Role } from "@/lib/auth/session";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type MemberActionState =
  | { error: string }
  | { message: string; tempPassword?: string }
  | undefined;

const ROLES: Role[] = ["instructor", "office", "admin"];
const PAGE = "/kontor/undervisere";

// Opretter en lærer eller kontorbruger på den aktive skole. Findes telefonnummeret allerede
// i Vixx (fx en lærer på en anden skole), tilføjes personen bare; koden ændres ikke.
export async function createMember(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const role = String(formData.get("role") ?? "instructor") as Role;

  if (!fullName) return { error: "Skriv personens navn." };
  if (!phone) return { error: "Skriv et gyldigt telefonnummer, fx 20 45 67 89." };
  if (!ROLES.includes(role)) return { error: "Vælg en rolle." };
  if (role !== "instructor" && membership.role !== "admin") {
    return { error: "Kun admin kan oprette kontorbrugere." };
  }

  const admin = createAdminClient();
  const supabase = await createClient();
  const schoolId = membership.schoolId;

  const { data: existing } = await admin.from("profiles").select("id, full_name").eq("phone", phone).maybeSingle();

  let userId: string;
  let tempPassword: string | undefined;

  if (existing) {
    userId = existing.id;
    const { data: already } = await admin
      .from("school_members")
      .select("role")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .maybeSingle();
    if (already) return { error: `${existing.full_name} er allerede oprettet på skolen.` };
  } else {
    tempPassword = generateTempPassword();
    const { data, error } = await admin.auth.admin.createUser({ ...authFieldsForPhone(phone), password: tempPassword });
    if (error || !data.user) {
      return { error: error?.code === "email_exists" || error?.code === "phone_exists"
        ? "Telefonnummeret er allerede i brug."
        : "Brugeren kunne ikke oprettes. Prøv igen." };
    }
    userId = data.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: userId, full_name: fullName, phone, must_change_password: true });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return { error: "Brugeren kunne ikke oprettes. Prøv igen." };
    }
  }

  // Medlemskab og lærerkort oprettes som den indloggede bruger, så RLS og ændringsloggen gælder.
  const undo = async () => {
    await supabase.from("school_members").delete().eq("school_id", schoolId).eq("user_id", userId);
    if (!existing) await admin.auth.admin.deleteUser(userId);
  };

  const { error: memberError } = await supabase.from("school_members").insert({ school_id: schoolId, user_id: userId, role });
  if (memberError) {
    await undo();
    return { error: "Du har ikke ret til at oprette denne bruger." };
  }

  if (role === "instructor") {
    const { error: instructorError } = await supabase.from("instructors").insert({ school_id: schoolId, user_id: userId });
    if (instructorError) {
      await undo();
      return { error: "Læreren kunne ikke oprettes. Prøv igen." };
    }
  }

  revalidatePath(PAGE);
  return existing
    ? { message: `${existing.full_name} findes allerede i Vixx og er nu tilføjet skolen. Personen logger ind med sin nuværende kode.` }
    : { message: `${fullName} er oprettet. Giv personen den midlertidige kode. Den vises kun nu.`, tempPassword };
}

// Hvem må nulstille kode og logge ud? Kontoret må håndtere lærere; kun admin må håndtere
// kontorbrugere. Personer, der er kontorbruger på en anden skole, håndteres ikke herfra.
async function authorizeManage(targetUserId: string): Promise<{ error: string } | null> {
  const { user, membership } = await requireRole(["admin", "office"]);
  if (targetUserId === user.id) return { error: "Det kan du ikke gøre for dig selv her." };

  const { data: memberships } = await createAdminClient()
    .from("school_members")
    .select("school_id, role")
    .eq("user_id", targetUserId);

  const all = memberships ?? [];
  if (!all.some((m) => m.school_id === membership.schoolId)) return { error: "Personen findes ikke på skolen." };
  if (all.some((m) => m.school_id !== membership.schoolId && m.role !== "instructor")) {
    return { error: "Personen er kontorbruger på en anden skole og kan ikke ændres herfra." };
  }
  if (all.some((m) => m.role !== "instructor") && membership.role !== "admin") {
    return { error: "Kun admin kan ændre kontorbrugere." };
  }
  return null;
}

export async function resetPassword(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const userId = String(formData.get("userId") ?? "");
  const denied = await authorizeManage(userId);
  if (denied) return denied;

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { error: "Koden kunne ikke nulstilles. Prøv igen." };

  // Som den indloggede kontorbruger, så ændringsloggen viser hvem.
  const supabase = await createClient();
  await supabase.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await admin.rpc("revoke_user_sessions", { p_user: userId });

  revalidatePath(PAGE);
  return { message: "Ny midlertidig kode. Personen er logget ud og skal vælge en ny kode ved næste login.", tempPassword };
}

export async function signOutEverywhere(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const userId = String(formData.get("userId") ?? "");
  const denied = await authorizeManage(userId);
  if (denied) return denied;

  const { error } = await createAdminClient().rpc("revoke_user_sessions", { p_user: userId });
  if (error) return { error: "Det lykkedes ikke. Prøv igen." };
  return { message: "Personen er logget ud på alle enheder." };
}
