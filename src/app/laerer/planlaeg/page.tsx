import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { inputClass } from "@/components/styles";
import { lessonLabel, lengthText } from "@/lib/lesson-plan";
import { PlanCell, PlannerProvider } from "../../kontor/elever/board-planner";
import { loadBoardPlans, loadEuHours, loadStudents } from "../../kontor/elever/data";
import { busyByResource, loadBookings, loadResources } from "@/lib/booking-data";
import { addDays, formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { loadStudentOptions } from "@/lib/student-options";
import { createClient } from "@/lib/supabase/server";
import { saveOwnLesson } from "../lesson-actions";
import { TeacherLessonForm } from "../lesson-form";
import { Screen } from "../screen";
import { allowedServices, getTeacher, loadTeacherPeriod } from "../teacher-data";

// "Planlæg" i lærerens app (Michael 27. nov. 2026): vælg eleven, se hvad eleven mangler i lektionsplanen (og EU), og
// planlæg det med dato og tid. Lektionen kommer i kalenderen, men tæller ikke i lønnen; den sendes "Til løn", når den er
// kørt. "Anden lektion" (med ydelse, uden lektionsplan) og rettelser bruger den gamle formular.
export default async function PlanOwnLessonPage({ searchParams }: PageProps<"/laerer/planlaeg">) {
  const teacher = await getTeacher();
  const students = await loadStudentOptions(teacher.membership.schoolId, teacher.instructorId);
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayDk();

  const id = typeof sp.id === "string" ? sp.id : undefined;
  const { data: lesson } = id
    ? await supabase
        .from("scheduled_lessons")
        .select("id, lesson_date, start_time, lesson_count, service_id, student_ids, student_name, note")
        .eq("id", id)
        .eq("origin", "instructor")
        .maybeSingle()
    : { data: null };
  if (id && !lesson) notFound();

  const other = sp.anden === "1" || !!lesson;
  const chosenDate = parseDateInput(typeof sp.dato === "string" ? sp.dato : "");
  if (!other) return <PlanForStudent teacher={teacher} date={chosenDate && chosenDate >= today ? chosenDate : today} studentId={typeof sp.elev === "string" ? sp.elev : ""} />;

  const date = lesson?.lesson_date ?? chosenDate ?? addDays(today, 1);
  if (date <= today) redirect(`/laerer/registrer?dato=${date}`);

  const [period, services, resources, bookings] = await Promise.all([
    loadTeacherPeriod(teacher, date, date),
    allowedServices(teacher),
    loadResources(teacher.membership.schoolId),
    loadBookings(teacher.membership.schoolId, date, date),
  ]);
  const lessonBooking = lesson ? bookings.find((b) => b.lessonId === lesson.id) : undefined;
  const back = `/laerer?dag=${date}`;
  if (period.holidays.some((h) => h.status === "approved")) redirect(back);
  const busy = [...period.lessons.filter((l) => l.id !== lesson?.id), ...period.absences, ...period.bookings];

  return (
    <Screen
      title={lesson ? "Ret planlagt lektion" : "Anden lektion"}
      sub={formatLongDate(date)}
      back={{ href: back, label: "Kalender" }}
    >
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">
          Lektionen lægges i kalenderen, så kontoret kan se, at du er optaget. Den tæller først med i lønnen, når du har
          trykket &quot;Til løn&quot;.
        </p>
        <TeacherLessonForm
          action={saveOwnLesson}
          submitLabel={lesson ? "Gem ændringer" : "Planlæg"}
          services={services}
          plan={teacher.plan}
          students={students}
          busy={busy}
          hiddenFields={{ date, ...(lesson ? { id: lesson.id } : {}) }}
          resources={resources}
          resourceBusy={busyByResource(bookings, lesson?.id)}
          initial={{
            serviceId: lesson?.service_id,
            count: lesson?.lesson_count,
            start: lesson?.start_time.slice(0, 5),
            studentIds: lesson?.student_ids ?? [],
            studentName: lesson?.student_name ?? undefined,
            note: lesson?.note ?? undefined,
            resourceId: lessonBooking?.resourceId,
          }}
        />
      </section>
    </Screen>
  );
}

// Vælg eleven og planlæg det, eleven mangler: lektion 1–9 og KTA i lektionsplanen og EU-køretimerne.
async function PlanForStudent({ teacher, date, studentId }: { teacher: Awaited<ReturnType<typeof getTeacher>>; date: string; studentId: string }) {
  const schoolId = teacher.membership.schoolId;
  const [options, { students, courses }, euHours, planned] = await Promise.all([
    loadStudentOptions(schoolId, teacher.instructorId),
    loadStudents(schoolId),
    loadEuHours(schoolId),
    loadBoardPlans(schoolId, todayDk()),
  ]);
  const mine = options.filter((o) => o.mine);
  const others = options.filter((o) => !o.mine);
  const student = students.find((s) => s.id === studentId && s.active);
  const course = student ? courses.find((c) => c.id === student.courseId) : undefined;
  const eu = student?.euCourseId ? euHours.get(student.euCourseId) : undefined;
  const missing = (course?.lessons ?? []).filter((l) => !student!.lessonSignoffs.some((x) => x.school_lesson_id === l.id));
  const drives = (eu?.driveList ?? []).filter((d) => !student!.euSignoffs.some((x) => x.kind === "drive" && x.eu_topic_id === d.id));
  const row = "flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left text-[15px] hover:border-accent";
  const status = (ref: string) => {
    const on = planned.get(`${studentId}:${ref}`);
    return on ? <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[12px] font-semibold text-warn">Planlagt {Number(on.date.slice(8, 10))}/{Number(on.date.slice(5, 7))} kl. {on.start}</span> : <span className="shrink-0 text-sm font-semibold text-accent-ink">Planlæg ›</span>;
  };

  return (
    <Screen title="Planlæg undervisning" sub={formatLongDate(date)} back={{ href: `/laerer?dag=${date}`, label: "Kalender" }}>
      <form className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="plan-student">
        <input type="hidden" name="dato" value={date} />
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Elev
          <select name="elev" defaultValue={studentId} className={inputClass}>
            <option value="">Vælg elev</option>
            {mine.length > 0 && (
              <optgroup label="Mine elever">
                {mine.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            )}
            <optgroup label={mine.length ? "Andre elever" : "Elever"}>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </optgroup>
          </select>
        </label>
        <button type="submit" className="h-11 rounded-xl border border-line2 bg-surface text-[15px] font-semibold">Vis hvad eleven mangler</button>
      </form>

      {student && (
        <PlannerProvider teachers={[{ id: teacher.instructorId, name: teacher.user.fullName }]} plan={teacher.plan} today={todayDk()} instructorId={teacher.instructorId} date={date}>
          <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="plan-missing">
            <h2 className="text-lg font-bold">{student.name} mangler</h2>
            {course && !course.lessons.length && (
              <p className="text-sm text-muted">{course.name} har ingen lektionsplan. Brug &quot;Anden lektion&quot; nedenfor.</p>
            )}
            {course && course.lessons.length > 0 && !missing.length && <p className="text-sm text-muted">Alle lektioner i lektionsplanen er kørt.</p>}
            {missing.map((l) => (
              <PlanCell key={l.id} studentId={student.id} studentName={student.name} className={row}
                target={{ type: "lesson", schoolLessonId: l.id, count: l.units.length || 1, label: l.kind === "kta" ? "KTA" : lessonLabel(l), anyTime: l.kind === "dark" }} planned={planned.get(`${student.id}:${l.id}`)}>
                <span className="flex flex-col">
                  <b>{l.kind === "kta" ? "KTA (køreteknisk anlæg)" : lessonLabel(l)}</b>
                  <span className="text-[13px] text-muted">{lengthText(l)}</span>
                </span>
                {status(l.id)}
              </PlanCell>
            ))}
            {drives.length > 0 && <h3 className="mt-2 text-[15px] font-bold">{eu!.name}</h3>}
            {drives.map((d) => (
              <PlanCell key={d.id} studentId={student.id} studentName={student.name} className={row}
                target={{ type: "eu", euTopicId: d.id, count: d.lessons, label: d.title }} planned={planned.get(`${student.id}:${d.id}`)}>
                <span className="flex flex-col">
                  <b>{d.title}</b>
                  <span className="text-[13px] text-muted">{d.lessons} {d.lessons === 1 ? "lektion" : "lektioner"}</span>
                </span>
                {status(d.id)}
              </PlanCell>
            ))}
            <p className="text-[13px] text-muted">Lektionen kommer i din og elevens kalender. Den tæller ikke i lønnen; tryk &quot;Til løn&quot;, når den er kørt.</p>
          </section>
        </PlannerProvider>
      )}

      {date > todayDk() && (
        <Link href={`/laerer/planlaeg?anden=1&dato=${date}`} className="text-center text-sm font-semibold text-accent-ink underline underline-offset-[3px]">
          Anden lektion (uden lektionsplan)
        </Link>
      )}
    </Screen>
  );
}
