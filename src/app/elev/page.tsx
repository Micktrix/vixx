import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StudentHome } from "./student-home";

export default async function StudentHomePage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!student) notFound();

  return <StudentHome studentId={student.id} firstName={user.fullName.split(" ")[0]} schoolName={membership.schoolName} />;
}
