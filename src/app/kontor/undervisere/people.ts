import "server-only";
import { roleLabels } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/session";
import { formatDate, todayDk } from "@/lib/dates";

// Rækker fra school_members med profil og lærerkort, som kontoret ser dem.
export const PERSON_SELECT =
  "user_id, role, active, profiles(full_name, phone, must_change_password), instructors(id, active, active_until, is_guest, guest_company)";

type InstructorRow = {
  id: string;
  active: boolean;
  active_until: string | null;
  is_guest: boolean;
  guest_company: string | null;
};

export type PersonRow = {
  user_id: string;
  role: Role;
  active: boolean;
  profiles: { full_name: string; phone: string; must_change_password: boolean } | null;
  instructors: InstructorRow | InstructorRow[] | null;
};

export type Person = {
  userId: string;
  name: string;
  phone: string;
  role: Role;
  memberActive: boolean;
  mustChangePassword: boolean;
  instructor: InstructorRow | null;
  teaches: boolean;
  expired: boolean;
  roles: string[];
  status: { label: string; tone: "neutral" | "accent" | "ok" | "bad" };
};

export function toPerson(row: PersonRow, today = todayDk()): Person {
  const instructor = Array.isArray(row.instructors) ? (row.instructors[0] ?? null) : row.instructors;
  const expired = !!instructor?.active_until && instructor.active_until < today;
  const teaches = !!instructor?.active && !expired;
  const roles = roleLabels({ memberRole: row.role, teaches });
  const onlyTeacher = row.role === "instructor";

  const status: Person["status"] = !row.active
    ? { label: "Deaktiveret", tone: "bad" }
    : onlyTeacher && expired
      ? { label: `Udløbet ${formatDate(instructor!.active_until!)}`, tone: "bad" }
      : row.profiles?.must_change_password
        ? { label: "Mangler første login", tone: "accent" }
        : instructor?.is_guest && instructor.active_until && teaches
          ? { label: `Gæst til ${formatDate(instructor.active_until)}`, tone: "neutral" }
          : { label: "Aktiv", tone: "ok" };

  return {
    userId: row.user_id,
    name: row.profiles?.full_name ?? "",
    phone: row.profiles?.phone ?? "",
    role: row.role,
    memberActive: row.active,
    mustChangePassword: !!row.profiles?.must_change_password,
    instructor,
    teaches,
    expired,
    roles,
    status,
  };
}
