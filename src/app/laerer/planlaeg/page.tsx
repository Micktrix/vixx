import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addDays, formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { saveOwnLesson } from "../lesson-actions";
import { TeacherLessonForm } from "../lesson-form";
import { Screen } from "../screen";
import { allowedServices, getTeacher, loadTeacherPeriod } from "../teacher-data";

// Læreren planlægger selv en lektion frem i tiden. Den blokerer tiden, men tæller først i lønnen ved "Udført".
export default async function PlanOwnLessonPage({ searchParams }: PageProps<"/laerer/planlaeg">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayDk();

  const id = typeof sp.id === "string" ? sp.id : undefined;
  const { data: lesson } = id
    ? await supabase
        .from("scheduled_lessons")
        .select("id, lesson_date, start_time, lesson_count, service_id, category_code, student_name, note")
        .eq("id", id)
        .eq("origin", "instructor")
        .maybeSingle()
    : { data: null };
  if (id && !lesson) notFound();

  const date = lesson?.lesson_date ?? parseDateInput(typeof sp.dato === "string" ? sp.dato : "") ?? addDays(today, 1);
  if (date <= today) redirect(`/laerer/registrer?dato=${date}`);

  const [period, services] = await Promise.all([loadTeacherPeriod(teacher, date, date), allowedServices(teacher)]);
  const back = `/laerer?dag=${date}`;
  if (period.holidays.some((h) => h.status === "approved")) redirect(back);
  const busy = [...period.lessons.filter((l) => l.id !== lesson?.id), ...period.absences];

  return (
    <Screen
      title={lesson ? "Ret planlagt lektion" : "Planlæg lektion"}
      sub={formatLongDate(date)}
      action={
        <Link href={back} className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">
          Lektionen lægges i kalenderen, så kontoret kan se, at du er optaget. Den tæller først med i lønnen, når du har
          trykket &quot;Udført&quot;.
        </p>
        <TeacherLessonForm
          action={saveOwnLesson}
          submitLabel={lesson ? "Gem ændringer" : "Planlæg"}
          services={services}
          lessonMinutes={teacher.lessonMinutes}
          busy={busy}
          hiddenFields={{ date, ...(lesson ? { id: lesson.id } : {}) }}
          initial={{
            serviceId: lesson?.service_id,
            category: lesson?.category_code,
            count: lesson?.lesson_count,
            start: lesson?.start_time.slice(0, 5),
            studentName: lesson?.student_name ?? undefined,
            note: lesson?.note ?? undefined,
          }}
        />
      </section>
    </Screen>
  );
}
