"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { authFieldsForPhone, firstPassword } from "@/lib/auth/login-identity";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput, todayDk } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Hold og elever. Kontoret (admin og office) opretter og retter; RLS håndhæver det også.

const PAGE = "/kontor/elever";
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function saveTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Skriv holdets navn." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  const startsRaw = text(formData, "startsOn");
  const startsOn = startsRaw ? parseDateInput(startsRaw) : null;
  if (startsRaw && !startsOn) return { error: "Startdatoen er ikke gyldig." };
  const values = {
    name,
    course_id: text(formData, "courseId") || null,
    starts_on: startsOn,
    ...(id ? { active: formData.get("active") === "on" } : {}),
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("teams").update(values).eq("id", id).eq("school_id", membership.schoolId).select("id").single()
    : await supabase.from("teams").insert({ ...values, school_id: membership.schoolId }).select("id").single();
  if (error?.code === "23505") return { error: `Holdet "${name}" findes allerede.` };
  if (error || !data) return { error: "Holdet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  if (!id) redirect(`${PAGE}/hold/${data.id}`);
  return { message: "Holdet er gemt." };
}

// Afslut eller genåbn et hold. Et afsluttet hold kan ikke få nye elever (databasen).
export async function setTeamActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const active = text(formData, "active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ active }).eq("id", text(formData, "id")).eq("school_id", membership.schoolId);
  if (error) return { error: "Holdet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  return undefined;
}

// Admin krydser en lektion af i elevens forløb, fx når en gæstelærer uden adgang til appen har kørt den.
// Den tæller som gennemført med det samme, går ikke til lønnen og kan ikke slettes (databasen).
export async function crossOffLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const lessonId = text(formData, "courseLessonId");
  const comment = text(formData, "comment");
  const date = parseDateInput(text(formData, "date"));
  if (!lessonId) return { error: "Vælg lektionen." };
  if (!date) return { error: "Vælg datoen." };
  if (date > todayDk()) return { error: "Datoen kan ikke ligge frem i tiden." };
  if (!comment) return { error: "Skriv en kommentar, fx hvem der kørte lektionen." };
  if (comment.length > 500) return { error: "Kommentaren er for lang." };

  const supabase = await createClient();
  const { error } = await supabase.from("lesson_signoffs").insert({
    school_id: membership.schoolId,
    student_id: text(formData, "studentId"),
    course_lesson_id: lessonId,
    lesson_number: "", // sættes af databasen fra forløbet
    instructor_id: null,
    lesson_date: date,
    comment,
  });
  if (error?.code === "23505") return { error: "Lektionen er allerede kvitteret." };
  if (error?.code === "23514") return { error: error.message };
  if (error) return { error: "Lektionen kunne ikke krydses af. Prøv igen." };
  revalidatePath(PAGE, "layout");
  revalidatePath("/elev", "layout");
  return { message: "Lektionen er krydset af." };
}

// Admin retter en kvittering, der er givet for den forkerte lektion, til den lektion, der blev kørt.
// Databasen sikrer, at kun admin kan, og at lektionen hører til elevens forløb. Rettelsen logges.
export async function moveSignoff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const lessonId = text(formData, "courseLessonId");
  if (!lessonId) return { error: "Vælg lektionen." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_signoffs")
    .update({ course_lesson_id: lessonId })
    .eq("id", text(formData, "id"))
    .select("id");
  if (error?.code === "23505") return { error: "Den lektion er allerede kvitteret." };
  if (error?.code === "23514") return { error: error.message };
  if (error || !data?.length) return { error: "Kvitteringen kunne ikke rettes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  revalidatePath("/elev", "layout");
  return { message: "Kvitteringen er rettet." };
}

function readStudent(formData: FormData) {
  const courseId = text(formData, "courseId");
  if (!courseId) return { error: "Vælg et forløb." } as const;
  return {
    course_id: courseId,
    team_id: text(formData, "teamId") || null,
    service_id: text(formData, "serviceId") || null,
  } as const;
}

// Opretter en elev med login. Findes telefonnummeret allerede i Vixx, bruges den eksisterende login.
export async function createStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const fullName = text(formData, "fullName");
  const phone = normalizePhone(text(formData, "phone"));
  if (!fullName) return { error: "Skriv elevens navn." };
  if (!phone) return { error: "Skriv et gyldigt telefonnummer, fx 20 45 67 89." };
  const values = readStudent(formData);
  if ("error" in values) return { error: values.error as string };

  const admin = createAdminClient();
  const supabase = await createClient();
  const schoolId = membership.schoolId;

  const { data: existing } = await admin.from("profiles").select("id, full_name").eq("phone", phone).maybeSingle();
  let userId: string;
  let tempPassword: string | undefined;
  if (existing) {
    userId = existing.id;
  } else {
    tempPassword = firstPassword(phone);
    const { data, error } = await admin.auth.admin.createUser({ ...authFieldsForPhone(phone), password: tempPassword });
    if (error || !data.user) return { error: "Eleven kunne ikke oprettes. Prøv igen." };
    userId = data.user.id;
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: userId, full_name: fullName, phone, must_change_password: true });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return { error: "Eleven kunne ikke oprettes. Prøv igen." };
    }
  }

  // Som den indloggede bruger, så RLS og ændringsloggen gælder.
  const { data: student, error } = await supabase
    .from("students")
    .insert({ ...values, school_id: schoolId, user_id: userId })
    .select("id")
    .single();
  if (error || !student) {
    if (!existing) await admin.auth.admin.deleteUser(userId);
    return { error: error?.code === "23505" ? `${existing?.full_name ?? fullName} er allerede elev på skolen.` : "Eleven kunne ikke oprettes. Prøv igen." };
  }

  revalidatePath(PAGE, "layout");
  const name = existing?.full_name ?? fullName;
  return existing
    ? { message: `${name} findes allerede i Vixx og er nu elev på skolen. Eleven logger ind med sin nuværende kode.`, href: `${PAGE}/${student.id}`, hrefLabel: `Åbn ${name}` }
    : {
        message: `${name} er oprettet. Første login er telefonnummeret som både brugernavn og kode. Derefter vælger eleven sin egen kode.`,
        tempPassword,
        href: `${PAGE}/${student.id}`,
        hrefLabel: `Åbn ${name}`,
      };
}

export async function updateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const values = readStudent(formData);
  if ("error" in values) return { error: values.error as string };
  const fullName = text(formData, "fullName");
  if (!fullName) return { error: "Skriv elevens navn." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .update({ ...values, active: formData.get("active") === "on" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("user_id")
    .single();
  if (error || !data) return { error: "Eleven kunne ikke gemmes. Prøv igen." };
  const { error: nameError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", data.user_id);
  if (nameError) return { error: "Navnet kunne ikke gemmes. Prøv igen." };
  revalidatePath(PAGE, "layout");
  return { message: "Eleven er gemt." };
}

// Nulstil elevens kode til telefonnummeret og log eleven ud.
export async function resetStudentPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("user_id, profiles(phone)")
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .single();
  const phone = (student?.profiles as unknown as { phone: string } | null)?.phone;
  if (!student || !phone) return { error: "Koden kunne ikke nulstilles. Prøv igen." };

  const admin = createAdminClient();
  const tempPassword = firstPassword(phone);
  const { error } = await admin.auth.admin.updateUserById(student.user_id, { password: tempPassword });
  if (error) return { error: "Koden kunne ikke nulstilles. Prøv igen." };
  await supabase.from("profiles").update({ must_change_password: true }).eq("id", student.user_id);
  await admin.rpc("revoke_user_sessions", { p_user: student.user_id });
  return { message: "Koden er nulstillet til telefonnummeret. Eleven er logget ud.", tempPassword };
}
