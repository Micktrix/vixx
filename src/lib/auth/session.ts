import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "office" | "instructor";

export type Membership = {
  schoolId: string;
  schoolName: string;
  role: Role;
};

export type CurrentUser = {
  id: string;
  fullName: string;
  phone: string;
  mustChangePassword: boolean;
  memberships: Membership[];
};

export const SCHOOL_COOKIE = "vixx_school";

// Den indloggede bruger, eller null. Tjekker tokenet (getClaims) og at sessionen ikke er
// afbrudt med "Log ud af alle enheder". Køres højst én gang pr. forespørgsel.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data: active } = await supabase.rpc("session_is_active");
  if (!active) return null;

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, must_change_password").eq("id", userId).single(),
    supabase
      .from("school_members")
      .select("school_id, role, schools(name)")
      .eq("user_id", userId)
      .eq("active", true),
  ]);
  if (!profile) return null;

  return {
    id: userId,
    fullName: profile.full_name,
    phone: profile.phone,
    mustChangePassword: profile.must_change_password,
    memberships: (members ?? []).map((m) => ({
      schoolId: m.school_id,
      schoolName: (m.schools as unknown as { name: string } | null)?.name ?? "",
      role: m.role as Role,
    })),
  };
});

// Den skole, brugeren arbejder i nu. Med én skole er det den; med flere den valgte.
export async function getActiveMembership(user: CurrentUser): Promise<Membership | null> {
  if (user.memberships.length === 1) return user.memberships[0];
  const chosen = (await cookies()).get(SCHOOL_COOKIE)?.value;
  return user.memberships.find((m) => m.schoolId === chosen) ?? null;
}

export function homeForRole(role: Role): string {
  return role === "instructor" ? "/laerer" : "/kontor";
}

// Hvor en indlogget bruger skal hen lige nu.
export async function homePath(user: CurrentUser): Promise<string> {
  if (user.mustChangePassword) return "/ny-kode";
  if (user.memberships.length === 0) return "/ingen-skole";
  const membership = await getActiveMembership(user);
  if (!membership) return "/vaelg-skole";
  return homeForRole(membership.role);
}

// Til layouts og serverhandlinger: kræver login, ny kode valgt og en af rollerne på den aktive skole.
export async function requireRole(roles: Role[]): Promise<{ user: CurrentUser; membership: Membership }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.mustChangePassword) redirect("/ny-kode");

  const membership = await getActiveMembership(user);
  if (!membership) redirect(await homePath(user));
  if (!roles.includes(membership.role)) redirect(homeForRole(membership.role));

  return { user, membership };
}
