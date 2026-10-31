import "server-only";
import { flagFor, type Flag } from "@/lib/approval";
import { lessonSpan, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export type Status = "pending" | "approved" | "rejected";

export type ApprovalRow = Span & {
  id: string;
  instructorId: string;
  instructorName: string;
  date: string;
  start: string;
  count: number;
  serviceId: string;
  serviceName: string;
  category: string;
  studentName: string | null;
  note: string | null;
  status: Status;
  comment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  officeEdited: boolean;
  plannedCount: number | null;
  flag: Flag;
  unitPriceOre: number | null;
};

type Row = {
  id: string;
  instructor_id: string;
  lesson_date: string;
  start_time: string;
  lesson_count: number;
  lesson_minutes: number;
  service_id: string;
  category_code: string;
  student_name: string | null;
  note: string | null;
  status: Status;
  decision_comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  office_edited_at: string | null;
  unit_price_ore: number | null;
  services: { name: string } | null;
  scheduled_lessons: { lesson_count: number; service_id: string } | null;
  instructors: { school_members: { profiles: { full_name: string } | null } | null } | null;
};

const SELECT =
  "id, instructor_id, lesson_date, start_time, lesson_count, lesson_minutes, service_id, category_code, student_name, note, status, decision_comment, decided_by, decided_at, office_edited_at, unit_price_ore, services(name), scheduled_lessons(lesson_count, service_id), instructors(school_members(profiles(full_name)))";

export async function loadApprovals(schoolId: string, status: Status, instructorId: string | null) {
  const supabase = await createClient();
  let query = supabase.from("registrations").select(SELECT).eq("school_id", schoolId).eq("status", status);
  if (instructorId) query = query.eq("instructor_id", instructorId);
  // Afventer: ældste først. Godkendt/afvist: nyeste først, de seneste 200.
  const { data } = await query.order("lesson_date", { ascending: status === "pending" }).order("start_time").limit(status === "pending" ? 1000 : 200);

  const rows = ((data ?? []) as unknown as Row[]).map(
    (r): ApprovalRow => ({
      ...lessonSpan(r.start_time, r.lesson_count, r.lesson_minutes),
      id: r.id,
      instructorId: r.instructor_id,
      instructorName: r.instructors?.school_members?.profiles?.full_name ?? "",
      date: r.lesson_date,
      start: r.start_time.slice(0, 5),
      count: r.lesson_count,
      serviceId: r.service_id,
      serviceName: r.services?.name ?? "",
      category: r.category_code,
      studentName: r.student_name,
      note: r.note,
      status: r.status,
      comment: r.decision_comment,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      officeEdited: !!r.office_edited_at,
      plannedCount: r.scheduled_lessons?.lesson_count ?? null,
      flag: flagFor(
        { serviceId: r.service_id, count: r.lesson_count },
        r.scheduled_lessons ? { serviceId: r.scheduled_lessons.service_id, count: r.scheduled_lessons.lesson_count } : null,
      ),
      unitPriceOre: r.unit_price_ore,
    }),
  );
  // Grupperet pr. lærer (alfabetisk), derefter dato og tid.
  return rows.sort(
    (a, b) =>
      a.instructorName.localeCompare(b.instructorName, "da") ||
      (status === "pending" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
      a.start.localeCompare(b.start),
  );
}
