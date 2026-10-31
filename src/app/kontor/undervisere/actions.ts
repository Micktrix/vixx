"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { authFieldsForPhone } from "@/lib/auth/login-identity";
import { roleSetFromChoices } from "@/lib/auth/roles";
import { requireRole, type Membership } from "@/lib/auth/session";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { parseDateInput } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/kontor/undervisere";
const personHref = (userId: string) => `${PAGE}/${userId}`;

function refresh() {
  revalidatePath(PAGE, "layout");
}

// Opretter en person med de valgte roller på den aktive skole. Findes telefonnummeret allerede
// i Vixx (fx en lærer på en anden skole), tilføjes personen bare; koden ændres ikke.
export async function createMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const roles = roleSetFromChoices(formData.getAll("roles").map(String));

  if (!fullName) return { error: "Skriv personens navn." };
  if (!phone) return { error: "Skriv et gyldigt telefonnummer, fx 20 45 67 89." };
  if (!roles) return { error: "Vælg mindst én rolle." };
  if (roles.memberRole !== "instructor" && membership.role !== "admin") {
    return { error: "Kun admin kan give adgang til kontoret." };
  }

  const guest = roles.teaches && formData.get("isGuest") === "on";
  const guestCompany = guest ? String(formData.get("guestCompany") ?? "").trim() || null : null;
  const untilRaw = guest ? String(formData.get("activeUntil") ?? "") : "";
  const activeUntil = untilRaw ? parseDateInput(untilRaw) : null;
  if (untilRaw && !activeUntil) return { error: "\"Aktiv til\" er ikke en gyldig dato." };

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
    if (already) {
      return {
        error: `${existing.full_name} er allerede på skolen. Ret rollerne på personens side.`,
      };
    }
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

  // Resten oprettes som den indloggede bruger, så RLS og ændringsloggen gælder.
  const undo = async () => {
    await supabase.from("school_members").delete().eq("school_id", schoolId).eq("user_id", userId);
    if (!existing) await admin.auth.admin.deleteUser(userId);
  };

  const { error: memberError } = await supabase
    .from("school_members")
    .insert({ school_id: schoolId, user_id: userId, role: roles.memberRole });
  if (memberError) {
    await undo();
    return { error: "Du har ikke ret til at oprette denne bruger." };
  }

  if (roles.teaches) {
    const { data: instructor, error: instructorError } = await supabase
      .from("instructors")
      .insert({ school_id: schoolId, user_id: userId, is_guest: guest, guest_company: guestCompany, active_until: activeUntil })
      .select("id")
      .single();
    const competenceError = instructor
      ? await insertCompetences(supabase, schoolId, instructor.id, formData)
      : null;
    if (instructorError || competenceError) {
      await undo();
      return { error: "Læreren kunne ikke oprettes. Prøv igen." };
    }
  }

  refresh();
  const name = existing?.full_name ?? fullName;
  return existing
    ? {
        message: `${name} findes allerede i Vixx og er nu tilføjet skolen. Personen logger ind med sin nuværende kode.`,
        href: personHref(userId),
        hrefLabel: `Åbn ${name}`,
      }
    : {
        message: `${name} er oprettet. Giv personen den midlertidige kode. Den vises kun nu.`,
        tempPassword,
        href: personHref(userId),
        hrefLabel: `Åbn ${name}`,
      };
}

async function insertCompetences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  instructorId: string,
  formData: FormData,
) {
  const categories = formData.getAll("categories").map(String);
  const types = formData.getAll("lessonTypes").map(String);
  if (categories.length) {
    const { error } = await supabase.from("instructor_categories").insert(
      categories.map((code) => ({ school_id: schoolId, instructor_id: instructorId, category_code: code })),
    );
    if (error) return error;
  }
  if (types.length) {
    const { error } = await supabase.from("instructor_lesson_types").insert(
      types.map((id) => ({ school_id: schoolId, instructor_id: instructorId, lesson_type_id: id })),
    );
    if (error) return error;
  }
  return null;
}

type Target = { memberships: { school_id: string; role: string; active: boolean }[] };

// Må den indloggede håndtere personen? Kontoret må håndtere rene lærere; kun admin må
// håndtere kontorbrugere. Personer, der er kontorbruger på en anden skole, håndteres ikke herfra.
async function loadTarget(targetUserId: string, membership: Membership): Promise<Target | { error: string }> {
  const { data } = await createAdminClient()
    .from("school_members")
    .select("school_id, role, active")
    .eq("user_id", targetUserId);

  const memberships = data ?? [];
  const here = memberships.find((m) => m.school_id === membership.schoolId);
  if (!here) return { error: "Personen findes ikke på skolen." };
  if (memberships.some((m) => m.school_id !== membership.schoolId && m.role !== "instructor")) {
    return { error: "Personen er kontorbruger på en anden skole og kan ikke ændres herfra." };
  }
  if (here.role !== "instructor" && membership.role !== "admin") {
    return { error: "Kun admin kan ændre kontorbrugere." };
  }
  return { memberships };
}

async function authorizeManage(targetUserId: string): Promise<(Target & { membership: Membership }) | { error: string }> {
  const { user, membership } = await requireRole(["admin", "office"]);
  if (targetUserId === user.id) return { error: "Det kan du ikke gøre for dig selv her." };
  const target = await loadTarget(targetUserId, membership);
  return "error" in target ? target : { ...target, membership };
}

export async function updatePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const target = await authorizeManage(userId);
  if ("error" in target) return target;

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!fullName) return { error: "Skriv personens navn." };
  if (!phone) return { error: "Skriv et gyldigt telefonnummer, fx 20 45 67 89." };

  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: current } = await admin.from("profiles").select("phone").eq("id", userId).single();
  if (!current) return { error: "Personen findes ikke." };

  // Telefonnummeret er brugernavnet, så login-identiteten skal følge med.
  const phoneChanged = current.phone !== phone;
  if (phoneChanged) {
    const { data: taken } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (taken) return { error: "Telefonnummeret er allerede i brug." };
    const { error } = await admin.auth.admin.updateUserById(userId, authFieldsForPhone(phone));
    if (error) return { error: "Telefonnummeret kunne ikke ændres. Prøv igen." };
  }

  const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", userId);
  if (error) {
    if (phoneChanged) await admin.auth.admin.updateUserById(userId, authFieldsForPhone(current.phone));
    return { error: "Oplysningerne kunne ikke gemmes. Prøv igen." };
  }

  refresh();
  return {
    message: phoneChanged
      ? "Gemt. Personen logger nu ind med det nye telefonnummer."
      : "Gemt.",
  };
}

// Kun admin ændrer roller. Lærerrollen slås fra i stedet for at blive slettet, så historik og løn bevares.
export async function setRoles(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin"]);
  const userId = String(formData.get("userId") ?? "");
  const roles = roleSetFromChoices(formData.getAll("roles").map(String));
  if (!roles) return { error: "Vælg mindst én rolle. Skal personen ikke længere have adgang, så deaktivér dem." };
  if (userId === user.id && roles.memberRole !== "admin") {
    return { error: "Du kan ikke fjerne din egen admin-rolle." };
  }

  const target = await loadTarget(userId, membership);
  if ("error" in target) return target;

  const supabase = await createClient();
  const schoolId = membership.schoolId;

  const { error: memberError } = await supabase
    .from("school_members")
    .update({ role: roles.memberRole })
    .eq("school_id", schoolId)
    .eq("user_id", userId);
  if (memberError) return { error: "Rollerne kunne ikke gemmes. Prøv igen." };

  const { data: instructor } = await supabase
    .from("instructors")
    .select("id, active")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();

  let error = null;
  if (instructor && instructor.active !== roles.teaches) {
    ({ error } = await supabase.from("instructors").update({ active: roles.teaches }).eq("id", instructor.id));
  } else if (!instructor && roles.teaches) {
    ({ error } = await supabase.from("instructors").insert({ school_id: schoolId, user_id: userId }));
  }
  if (error) return { error: "Lærerrollen kunne ikke gemmes. Prøv igen." };

  refresh();
  return { message: "Rollerne er gemt." };
}

// Deaktiveret: kan ikke logge ind eller planlægges på skolen. Historik og løn bevares.
export async function setMemberActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";
  const target = await authorizeManage(userId);
  if ("error" in target) return target;
  const { membership } = target;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_members")
    .update({ active })
    .eq("school_id", membership.schoolId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { error: "Det lykkedes ikke. Prøv igen." };

  // Har personen ingen andre skoler, logges de også ud med det samme.
  const elsewhere = target.memberships.some((m) => m.school_id !== membership.schoolId && m.active);
  if (!active && !elsewhere) await createAdminClient().rpc("revoke_user_sessions", { p_user: userId });

  refresh();
  return { message: active ? "Personen er aktiv igen og kan logge ind." : "Personen er deaktiveret og kan ikke længere logge ind." };
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const target = await authorizeManage(userId);
  if ("error" in target) return target;

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { error: "Koden kunne ikke nulstilles. Prøv igen." };

  // Som den indloggede kontorbruger, så ændringsloggen viser hvem.
  const supabase = await createClient();
  await supabase.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await admin.rpc("revoke_user_sessions", { p_user: userId });

  refresh();
  return { message: "Ny midlertidig kode. Personen er logget ud og skal vælge en ny kode ved næste login.", tempPassword };
}

export async function signOutEverywhere(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("userId") ?? "");
  const target = await authorizeManage(userId);
  if ("error" in target) return target;

  const { error } = await createAdminClient().rpc("revoke_user_sessions", { p_user: userId });
  if (error) return { error: "Det lykkedes ikke. Prøv igen." };
  return { message: "Personen er logget ud på alle enheder." };
}
