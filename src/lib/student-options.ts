import "server-only";
import { createClient } from "@/lib/supabase/server";

export type StudentOption = { id: string; name: string; mine: boolean };

// Skolens aktive elever til valg af elev på en lektion. Lærerens faste elever står først (mine).
export async function loadStudentOptions(schoolId: string, instructorId?: string): Promise<StudentOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, profiles(full_name), student_instructors(instructor_id)")
    .eq("school_id", schoolId)
    .eq("active", true);
  return (data ?? [])
    .map((s) => ({
      id: s.id,
      name: (s.profiles as unknown as { full_name: string } | null)?.full_name ?? "",
      mine: !!instructorId && ((s.student_instructors ?? []) as { instructor_id: string }[]).some((l) => l.instructor_id === instructorId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}

// Navne på skolens elever (også afsluttede), til visning af eleverne på en lektion.
export async function loadStudentNames(schoolId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id, profiles(full_name)").eq("school_id", schoolId);
  return new Map((data ?? []).map((s) => [s.id, (s.profiles as unknown as { full_name: string } | null)?.full_name ?? ""]));
}

// Eleverne på en lektion som én tekst: valgte elever fra Vixx og evt. fritekst, fx "Emil Elev, Freja Elev, Per".
export function studentsLabel(ids: string[] | null | undefined, names: Map<string, string>, freeText?: string | null): string | null {
  const all = [...(ids ?? []).map((id) => names.get(id)).filter(Boolean), ...(freeText?.trim() ? [freeText.trim()] : [])];
  return all.length ? all.join(", ") : null;
}
