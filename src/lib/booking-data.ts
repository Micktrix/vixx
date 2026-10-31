import "server-only";
import { toMinutes, type Span } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Lokaler og køretøjer med bookinger. Alle på skolen kan se dem (RLS), så både kontoret og lærerne bruger dette.

export type ResourceKind = "room" | "vehicle";
export type Resource = { id: string; kind: ResourceKind; name: string; category: string | null; active: boolean };

export type Booking = Span & {
  id: string;
  resourceId: string;
  date: string;
  start: string;
  minutes: number;
  title: string | null;
  instructorId: string | null;
  instructorName: string | null;
  lessonId: string | null;
  lessonLabel: string | null; // fx "Amu C · C" for en lektions booking (aldrig elevnavn)
};

export async function loadResources(schoolId: string, includeInactive = false): Promise<Resource[]> {
  const supabase = await createClient();
  let q = supabase.from("resources").select("id, kind, name, vehicle_category_code, active").eq("school_id", schoolId);
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q.order("name");
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, name: r.name, category: r.vehicle_category_code, active: r.active }));
}

type Row = {
  id: string;
  resource_id: string;
  booking_date: string;
  start_time: string;
  minutes: number;
  title: string | null;
  instructor_id: string | null;
  scheduled_lesson_id: string | null;
  instructors: { school_members: { profiles: { full_name: string } | null } | null } | null;
  scheduled_lessons: { category_code: string; services: { name: string } | null } | null;
};

export async function loadBookings(schoolId: string, from: string, to: string): Promise<Booking[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, resource_id, booking_date, start_time, minutes, title, instructor_id, scheduled_lesson_id, instructors(school_members(profiles(full_name))), scheduled_lessons(category_code, services(name))",
    )
    .eq("school_id", schoolId)
    .gte("booking_date", from)
    .lte("booking_date", to)
    .order("start_time");
  return ((data ?? []) as unknown as Row[]).map((b) => {
    const from = toMinutes(b.start_time);
    return {
      id: b.id,
      resourceId: b.resource_id,
      date: b.booking_date,
      start: b.start_time.slice(0, 5),
      minutes: b.minutes,
      from,
      to: from + b.minutes,
      title: b.title,
      instructorId: b.instructor_id,
      instructorName: b.instructors?.school_members?.profiles?.full_name ?? null,
      lessonId: b.scheduled_lesson_id,
      lessonLabel: b.scheduled_lessons
        ? `${b.scheduled_lessons.services?.name ?? "Lektion"} · ${b.scheduled_lessons.category_code}`
        : null,
    };
  });
}

export const KIND_LABEL: Record<ResourceKind, { one: string; many: string; path: string }> = {
  room: { one: "lokale", many: "Lokaler", path: "/kontor/lokaler" },
  vehicle: { one: "køretøj", many: "Køretøjer", path: "/kontor/koeretoejer" },
};

// Optagede tider pr. lokale/køretøj (eventuelt uden bookingen til én lektion).
export function busyByResource(bookings: Booking[], ignoreLessonId?: string): Record<string, Span[]> {
  const busy: Record<string, Span[]> = {};
  for (const b of bookings) {
    if (ignoreLessonId && b.lessonId === ignoreLessonId) continue;
    (busy[b.resourceId] ??= []).push({ from: b.from, to: b.to });
  }
  return busy;
}
