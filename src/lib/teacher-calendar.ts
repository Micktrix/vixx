import "server-only";
import { addDays, todayDk } from "@/lib/dates";
import { buildCalendar, type CalendarEvent } from "@/lib/ical";
import { absenceSpan, storedSpan } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

const REASON = { sick: "Syg", off: "Fri", other: "Fravær" } as const;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Lærerens kalenderfil ud fra det hemmelige link: lektioner (med bil/lokale), egne bookinger, fravær og
// godkendt ferie fra 30 dage tilbage til et halvt år frem. Aldrig elevnavne. Null, hvis linket ikke
// findes, eller læreren ikke længere er aktiv.
export async function teacherCalendar(token: string): Promise<string | null> {
  if (!isUuid(token)) return null;
  const admin = createAdminClient();
  const { data: instructor } = await admin
    .from("instructors")
    .select("id, active, active_until, school_members!inner(active, profiles(full_name))")
    .eq("calendar_token", token)
    .maybeSingle();
  const member = instructor?.school_members as unknown as { active: boolean; profiles: { full_name: string } | null } | null;
  const today = todayDk();
  if (!instructor || !instructor.active || !member?.active || (instructor.active_until && instructor.active_until < today)) {
    return null;
  }

  const from = addDays(today, -30);
  const to = addDays(today, 180);
  const id = instructor.id;
  const [lessons, bookings, absences, holidays] = await Promise.all([
    admin
      .from("scheduled_lessons")
      .select("id, lesson_date, start_time, span_minutes, lesson_count, services(name)")
      .eq("instructor_id", id)
      .gte("lesson_date", from)
      .lte("lesson_date", to),
    admin
      .from("bookings")
      .select("id, booking_date, start_time, minutes, title, scheduled_lesson_id, resources(name)")
      .eq("instructor_id", id)
      .gte("booking_date", from)
      .lte("booking_date", to),
    admin
      .from("absences")
      .select("id, absence_date, start_time, hours, reason")
      .eq("instructor_id", id)
      .gte("absence_date", from)
      .lte("absence_date", to),
    admin
      .from("holidays")
      .select("id, from_date, to_date")
      .eq("instructor_id", id)
      .eq("status", "approved")
      .lte("from_date", to)
      .gte("to_date", from),
  ]);

  const name = (x: unknown) => (x as { name: string } | null)?.name ?? "";
  const resourceOfLesson = new Map(
    (bookings.data ?? []).filter((b) => b.scheduled_lesson_id).map((b) => [b.scheduled_lesson_id!, name(b.resources)]),
  );
  const events: CalendarEvent[] = [
    ...(lessons.data ?? []).map((l) => {
      const resource = resourceOfLesson.get(l.id);
      return {
        uid: `lesson-${l.id}`,
        date: l.lesson_date,
        ...storedSpan(l.start_time, l.span_minutes),
        summary: [name(l.services) || "Lektion", resource].filter(Boolean).join(" · "),
        description: `${l.lesson_count} ${l.lesson_count === 1 ? "lektion" : "lektioner"}`,
        location: resource,
      };
    }),
    ...(bookings.data ?? [])
      .filter((b) => !b.scheduled_lesson_id)
      .map((b) => ({
        uid: `booking-${b.id}`,
        date: b.booking_date,
        ...storedSpan(b.start_time, b.minutes),
        summary: [b.title?.trim() || "Booket", name(b.resources)].filter(Boolean).join(" · "),
        location: name(b.resources),
      })),
    ...(absences.data ?? []).map((a) => ({
      uid: `absence-${a.id}`,
      date: a.absence_date,
      ...absenceSpan(a.start_time, Number(a.hours)),
      summary: REASON[a.reason as keyof typeof REASON] ?? "Fravær",
    })),
    ...(holidays.data ?? []).map((h) => ({
      uid: `holiday-${h.id}`,
      date: h.from_date,
      endDate: addDays(h.to_date, 1),
      allDay: true as const,
      summary: "Ferie",
    })),
  ];
  return buildCalendar(`Vixx – ${member.profiles?.full_name ?? "Mine lektioner"}`, events);
}
