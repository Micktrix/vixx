import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StudentMore } from "../student-more";

export default async function StudentMorePage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).maybeSingle();
  if (!student) notFound();
  return <StudentMore schoolId={membership.schoolId} studentId={student.id} name={user.fullName} phone={user.phone} />;
}
