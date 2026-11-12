import "server-only";
import { addDays, todayDk } from "@/lib/dates";
import { buildCalendar, type CalendarEvent } from "@/lib/ical";
import { storedSpan } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Elevens kalenderfil ud fra det hemmelige link: planlagte lektioner med eleven og kørte lektioner (læreren
// har registreret dem med eleven), fra 30 dage tilbage til et halvt år frem. Null, hvis linket ikke findes,
// eller eleven ikke er aktiv.
export async function studentCalendar(token: string): Promise<string | null> {
  if (!isUuid(token)) return null;
  const admin = createAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("id, active, schools(name)")
    .eq("calendar_token", token)
    .maybeSingle();
  if (!student?.active) return null;

  const from = addDays(todayDk(), -30);
  const to = addDays(todayDk(), 180);
  const teacher = "instructors(school_members(profiles(full_name)))";
  const [lessons, driven] = await Promise.all([
    admin
      .from("scheduled_lessons")
      .select(`id, lesson_date, start_time, span_minutes, lesson_count, ${teacher}`)
      .eq("student_id", student.id)
      .gte("lesson_date", from)
      .lte("lesson_date", to),
    admin
      .from("registrations")
      .select(`id, lesson_date, start_time, span_minutes, lesson_count, scheduled_lesson_id, ${teacher}`)
      .eq("student_id", student.id)
      .neq("status", "rejected")
      .gte("lesson_date", from)
      .lte("lesson_date", to),
  ]);

  const teacherName = (x: unknown) =>
    (x as { school_members: { profiles: { full_name: string } | null } | null } | null)?.school_members?.profiles?.full_name ?? "";
  const planned = new Set((lessons.data ?? []).map((l) => l.id));
  const event = (kind: string, l: { id: string; lesson_date: string; start_time: string; span_minutes: number; lesson_count: number; instructors: unknown }) => ({
    uid: `${kind}-${l.id}`,
    date: l.lesson_date,
    ...storedSpan(l.start_time, l.span_minutes),
    summary: ["Kørelektion", teacherName(l.instructors)].filter(Boolean).join(" · "),
    description: `${l.lesson_count} ${l.lesson_count === 1 ? "lektion" : "lektioner"}`,
  });
  const events: CalendarEvent[] = [
    ...(lessons.data ?? []).map((l) => event("lesson", l)),
    // Kørte lektioner, der ikke var planlagt på forhånd (fx kvitteret med QR-koden).
    ...(driven.data ?? []).filter((r) => !r.scheduled_lesson_id || !planned.has(r.scheduled_lesson_id)).map((r) => event("driven", r)),
  ];
  const school = (student.schools as unknown as { name: string } | null)?.name;
  return buildCalendar(`Vixx – ${school ?? "Mine kørelektioner"}`, events);
}
