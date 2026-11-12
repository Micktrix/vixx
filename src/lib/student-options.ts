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
