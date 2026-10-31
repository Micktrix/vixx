import type { Role } from "./session";

// Roller vælges som afkrydsning: Admin, Kontor og Lærer i alle kombinationer.
// I databasen er det én adgang til kontoret (school_members.role) plus lærerrollen (instructors.active).
// Admin kan alt, kontoret kan, så Admin + Kontor er det samme som Admin.
export type RoleChoice = "admin" | "office" | "instructor";

export type RoleSet = { memberRole: Role; teaches: boolean };

export function roleSetFromChoices(choices: string[]): RoleSet | null {
  const teaches = choices.includes("instructor");
  if (choices.includes("admin")) return { memberRole: "admin", teaches };
  if (choices.includes("office")) return { memberRole: "office", teaches };
  return teaches ? { memberRole: "instructor", teaches } : null;
}

export function roleLabels({ memberRole, teaches }: RoleSet): string[] {
  const labels: string[] = [];
  if (memberRole === "admin") labels.push("Admin");
  if (memberRole === "office") labels.push("Kontor");
  if (teaches) labels.push("Lærer");
  return labels;
}
