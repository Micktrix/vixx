import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "office" | "instructor" | "student";

// En person kan have flere roller på samme skole: `role` giver adgang til kontoret
// ("admin" eller "office"; "instructor" betyder kun lærer), og `teaches` er lærerrollen.
// "student" er en elev (tabellen students, ikke school_members) og har kun adgang til elevens app.
export type Membership = {
  schoolId: string;
  schoolName: string;
  role: Role;
  teaches: boolean;
};

export type CurrentUser = {
  id: string;
  fullName: string;
  phone: string;
  mustChangePassword: boolean;
  memberships: Membership[];
  isPlatformOwner: boolean; // kan oprette og se alle skoler (/platform)
};

export const SCHOOL_COOKIE = "vixx_school";
// Den del af appen, man sidst brugte ("kontor" eller "laerer"). Sættes af src/proxy.ts.
export const PART_COOKIE = "vixx_part";

// Den indloggede bruger, eller null. Tjekker tokenet (getClaims) og at sessionen ikke er
// afbrudt med "Log ud af alle enheder". Køres højst én gang pr. forespørgsel.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data: active } = await supabase.rpc("session_is_active");
  if (!active) return null;

  const [{ data: profile }, { data: members }, { data: owner }, { data: studentRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, must_change_password").eq("id", userId).single(),
    supabase
      .from("school_members")
      .select("school_id, role, schools(name), instructors(active, active_until)")
      .eq("user_id", userId)
      .eq("active", true),
    supabase.from("platform_owners").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("students").select("school_id, schools(name)").eq("user_id", userId).eq("active", true),
  ]);
  if (!profile) return null;

  const today = todayDk();
  const memberships = (members ?? [])
    .map((m) => {
      const instructor = one(m.instructors as unknown as InstructorAccess | InstructorAccess[] | null);
      return {
        schoolId: m.school_id,
        schoolName: (m.schools as unknown as { name: string } | null)?.name ?? "",
        role: m.role as Role,
        teaches: !!instructor && instructor.active && (!instructor.active_until || instructor.active_until >= today),
      };
    })
    // Kun lærer, men lærerrollen er slået fra eller udløbet (gæst): ingen adgang. Samme regel som i RLS.
    .filter((m) => m.role !== "instructor" || m.teaches);
  // Elev på en skole, hvor man ikke i forvejen er ansat.
  for (const s of studentRows ?? []) {
    if (memberships.some((m) => m.schoolId === s.school_id)) continue;
    memberships.push({
      schoolId: s.school_id,
      schoolName: (s.schools as unknown as { name: string } | null)?.name ?? "",
      role: "student",
      teaches: false,
    });
  }

  return {
    id: userId,
    fullName: profile.full_name,
    phone: profile.phone,
    mustChangePassword: profile.must_change_password,
    memberships,
    isPlatformOwner: !!owner,
  };
});

type InstructorAccess = { active: boolean; active_until: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export const isStaff = (m: Membership) => m.role === "admin" || m.role === "office";

// Den skole, brugeren arbejder i nu. Med én skole er det den; med flere den valgte.
export async function getActiveMembership(user: CurrentUser): Promise<Membership | null> {
  if (user.memberships.length === 1) return user.memberships[0];
  const chosen = (await cookies()).get(SCHOOL_COOKIE)?.value;
  return user.memberships.find((m) => m.schoolId === chosen) ?? null;
}

// Har man både kontor og lærer, lander man der, hvor man sidst var. Første gang afgør enheden:
// telefon → lærer-appen, computer → kontoret.
export async function homeFor(membership: Membership): Promise<string> {
  if (membership.role === "student") return "/elev";
  if (!isStaff(membership)) return "/laerer";
  if (!membership.teaches) return "/kontor";
  const last = (await cookies()).get(PART_COOKIE)?.value;
  if (last === "laerer" || last === "kontor") return `/${last}`;
  return isPhone((await headers()).get("user-agent") ?? "") ? "/laerer" : "/kontor";
}

export const isPhone = (userAgent: string) => /Mobi|Android|iPhone|iPod/i.test(userAgent);

// Hvor en indlogget bruger skal hen lige nu.
export async function homePath(user: CurrentUser): Promise<string> {
  if (user.mustChangePassword) return "/ny-kode";
  if (user.memberships.length === 0) return user.isPlatformOwner ? "/platform" : "/ingen-skole";
  const membership = await getActiveMembership(user);
  if (!membership) return "/vaelg-skole";
  return await homeFor(membership);
}

// Til layouts og serverhandlinger: kræver login, ny kode valgt og en af rollerne på den aktive skole.
// "instructor" er opfyldt af alle med lærerrollen, også admin og kontor, der underviser.
export async function requireRole(roles: Role[]): Promise<{ user: CurrentUser; membership: Membership }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.mustChangePassword) redirect("/ny-kode");

  const membership = await getActiveMembership(user);
  if (!membership) redirect(await homePath(user));
  const allowed = roles.some((r) => (r === "instructor" ? membership.teaches : membership.role === r));
  if (!allowed) redirect(await homeFor(membership));

  return { user, membership };
}

// Til platform-siden: kræver login, egen kode valgt og at brugeren er platform-ejer.
export async function requirePlatformOwner(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.mustChangePassword) redirect("/ny-kode");
  if (!user.isPlatformOwner) redirect(await homePath(user));
  return user;
}
