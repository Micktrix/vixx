"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { loginEmailForPhone, MIN_PASSWORD_LENGTH } from "./login-identity";
import { getCurrentUser, SCHOOL_COOKIE } from "./session";

export type FormState = { error?: string } | undefined;

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!phone) return { error: "Skriv dit telefonnummer, fx 20 45 67 89." };
  if (!password) return { error: "Skriv din kode." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmailForPhone(phone), password });
  // Samme besked uanset årsag, så man ikke kan se, om nummeret findes.
  if (error) return { error: "Forkert telefonnummer eller kode." };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(SCHOOL_COOKIE);
  redirect("/");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Koden skal være på mindst ${MIN_PASSWORD_LENGTH} tegn.` };
  if (password !== repeat) return { error: "De to koder er ikke ens." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Vælg en anden kode end den midlertidige." };
    if (error.code === "weak_password") return { error: "Koden er for svag. Vælg en længere kode." };
    return { error: "Koden kunne ikke gemmes. Prøv igen." };
  }

  // Brugeren må ikke selv rette sin profil (RLS), så serveren sætter flaget for den indloggede bruger.
  const { error: profileError } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (profileError) return { error: "Koden er gemt, men noget gik galt. Prøv at logge ind igen." };

  redirect("/");
}

export async function chooseSchool(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const schoolId = String(formData.get("schoolId") ?? "");
  if (user.memberships.some((m) => m.schoolId === schoolId)) {
    (await cookies()).set(SCHOOL_COOKIE, schoolId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  redirect("/");
}
