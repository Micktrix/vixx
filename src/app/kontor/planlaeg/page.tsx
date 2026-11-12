import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { busyByResource, loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { toPlan } from "@/lib/schedule";
import { loadStudentOptions } from "@/lib/student-options";
import { createClient } from "@/lib/supabase/server";
import { calendarHref } from "../calendar/params";
import { dayInfo, loadSchedule } from "../schedule-data";
import { deleteLesson } from "./actions";
import { LessonForm, type FormService } from "./lesson-form";

export default async function PlanLessonPage({ searchParams }: PageProps<"/kontor/planlaeg">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const supabase = await createClient();
  const today = todayDk();

  const lessonId = one("id");
  const { data: lesson } = lessonId
    ? await supabase
        .from("scheduled_lessons")
        .select("id, instructor_id, lesson_date, start_time, lesson_count, lesson_minutes, service_id, student_id, student_name, note, origin")
        .eq("id", lessonId)
        .eq("school_id", membership.schoolId)
        .maybeSingle()
    : { data: null };
  if (lessonId && !lesson) notFound();

  const date = lesson?.lesson_date ?? parseDateInput(one("dato") ?? "") ?? today;
  const [schedule, { data: services }, { data: school }, resources, bookings, students] = await Promise.all([
    loadSchedule(membership.schoolId, date, date),
    supabase
      .from("services")
      .select("id, name, break_after")
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabase.from("schools").select("lesson_minutes, lesson_starts").eq("id", membership.schoolId).single(),
    loadResources(membership.schoolId),
    loadBookings(membership.schoolId, date, date),
    loadStudentOptions(membership.schoolId),
  ]);
  const lessonBooking = lesson ? bookings.find((b) => b.lessonId === lesson.id) : undefined;

  const instructorId = lesson?.instructor_id ?? one("laerer") ?? "";
  const instructor = schedule.instructors.find((i) => i.id === instructorId);
  const formServices: FormService[] = (services ?? []).map((s) => ({ id: s.id, name: s.name, breakAfter: s.break_after }));

  // Planens starttider. En ældre lektion uden for planen kan beholde sin starttid.
  const plan = toPlan(school?.lesson_starts, lesson?.lesson_minutes ?? school?.lesson_minutes ?? 45);
  const lessonStart = lesson?.start_time.slice(0, 5);
  if (lessonStart && !plan.starts.includes(lessonStart)) plan.starts = [...plan.starts, lessonStart].sort();

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={calendarHref({ view: "dag", date })} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Kalender {formatLongDate(date)}
        </Link>
        <h1 className="text-[30px] font-bold">{lesson ? "Ret lektion" : "Planlæg lektion"}</h1>
        {lesson?.origin === "instructor" && <p className="text-muted">Lagt ind af underviseren selv.</p>}
      </header>

      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <LessonForm
          instructors={schedule.instructors}
          services={formServices}
          plan={plan}
          today={today}
          students={students}
          initialDay={instructor ? dayInfo(schedule, instructor, date, lesson?.id) : null}
          resources={resources}
          initialResourceBusy={busyByResource(bookings, lesson?.id)}
          initial={{
            id: lesson?.id,
            instructorId,
            date,
            start: lesson?.start_time.slice(0, 5) ?? one("start"),
            count: lesson?.lesson_count ?? 1,
            serviceId: lesson?.service_id,
            studentId: lesson?.student_id ?? undefined,
            studentName: lesson?.student_name ?? undefined,
            note: lesson?.note ?? undefined,
            resourceId: lessonBooking?.resourceId,
          }}
        />
      </section>

      {lesson && (
        <ActionForm
          action={deleteLesson}
          submitLabel="Fjern lektion"
          pendingLabel="Fjerner …"
          confirmText="Fjern lektionen fra kalenderen?"
          primary={false}
        >
          <input type="hidden" name="id" value={lesson.id} />
        </ActionForm>
      )}
    </>
  );
}
