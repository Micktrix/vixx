import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StudentCalendar } from "../student-calendar";

export default async function StudentCalendarPage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).maybeSingle();
  if (!student) notFound();
  return <StudentCalendar schoolId={membership.schoolId} schoolName={membership.schoolName} studentId={student.id} />;
}
