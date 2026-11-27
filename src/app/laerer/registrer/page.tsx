import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/form";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { formatSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { deleteRegistration, saveRegistration } from "../lesson-actions";
import { TeacherLessonForm } from "../lesson-form";
import { Screen } from "../screen";
import { allowedServices, getTeacher, isLocked, loadTeacherPeriod } from "../teacher-data";

// "Til løn" på en planlagt lektion, "Lektioner til løn" (ikke planlagt) eller ret en registrering, der ikke er godkendt.
// Lønnen skal kun bruge ydelse, tid og antal; eleverne hører til planlægningen. En note er nok (Michael 27. nov. 2026).
export default async function RegisterPage({ searchParams }: PageProps<"/laerer/registrer">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayDk();

  const id = typeof sp.id === "string" ? sp.id : undefined;
  const { data: reg } = id
    ? await supabase
        .from("registrations")
        .select("id, lesson_date, start_time, lesson_count, service_id, status, student_ids, student_name, note, decision_comment")
        .eq("id", id)
        .maybeSingle()
    : { data: null };
  if (id && !reg) notFound();

  // "Til løn": den planlagte lektion udfylder tid, antal og note; læreren vælger selv ydelsen.
  const lessonId = typeof sp.lektion === "string" ? sp.lektion : undefined;
  const { data: lesson } = lessonId
    ? await supabase
        .from("scheduled_lessons")
        .select("id, lesson_date, start_time, lesson_count, service_id, note, student_ids, student_name")
        .eq("id", lessonId)
        .eq("instructor_id", teacher.instructorId)
        .maybeSingle()
    : { data: null };
  if (lessonId && !lesson) notFound();

  const date = reg?.lesson_date ?? lesson?.lesson_date ?? parseDateInput(typeof sp.dato === "string" ? sp.dato : "") ?? today;
  if (date > today) redirect(`/laerer/planlaeg?dato=${date}`);

  const [period, services] = await Promise.all([loadTeacherPeriod(teacher, date, date), allowedServices(teacher)]);
  const back = `/laerer?dag=${date}`;
  if (isLocked(period, date) || reg?.status === "approved") redirect(back);

  const busy = period.registrations.filter((r) => r.status !== "rejected" && r.id !== reg?.id);
  const openPlanned = period.lessons.filter((l) => !period.registrations.some((r) => r.scheduledLessonId === l.id));
  if (lesson && !openPlanned.some((l) => l.id === lesson.id)) redirect(back); // allerede sendt til løn
  const planned = lesson ? period.lessons.find((l) => l.id === lesson.id) : undefined;
  const lessonNote = planned ? [lesson?.note, planned.studentName].filter(Boolean).join(" · ") : undefined;

  return (
    <Screen
      title={reg ? (reg.status === "rejected" ? "Ret og send igen" : "Ret lektion") : lesson ? "Til løn" : "Lektioner til løn"}
      sub={formatLongDate(date)}
      back={{ href: back, label: "Kalender" }}
    >
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        {reg?.status === "rejected" && reg.decision_comment && (
          <p className="rounded-xl bg-bad-bg px-3.5 py-2.5 text-sm text-bad">Kontoret: {reg.decision_comment}</p>
        )}
        {lesson && planned && (
          <p className="rounded-xl bg-accent-bg px-3.5 py-2.5 text-sm" data-testid="pay-lesson">
            <b>
              {formatSpan(planned)} · {planned.serviceName}
            </b>
            {planned.studentName && <span className="block text-[13px] text-muted">{planned.studentName}</span>}
            <span className="block">Vælg ydelsen, og ret antallet, hvis lektionen blev kortere eller længere.</span>
          </p>
        )}
        {!reg &&
          !lesson &&
          (openPlanned.length ? (
            <p className="rounded-xl bg-accent-bg px-3.5 py-2.5 text-sm">
              Planlagt i dag: {openPlanned.map((l) => `${formatSpan(l)} ${l.serviceName}`).join(", ")}. Har du kørt den, så tryk
              &quot;Til løn&quot; på den i kalenderen i stedet.
            </p>
          ) : (
            <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">Lektionen står ikke i dit skema. Skriv gerne en kort note til kontoret.</p>
          ))}
        <TeacherLessonForm
          action={saveRegistration}
          submitLabel={reg ? (reg.status === "rejected" ? "Send igen" : "Gem ændringer") : lesson ? "Send til løn" : "Gem lektioner"}
          services={services}
          plan={teacher.plan}
          busy={busy}
          hiddenFields={{ date, ...(reg ? { id: reg.id } : {}), ...(lesson ? { scheduledLessonId: lesson.id } : {}) }}
          initial={{
            serviceId: reg?.service_id ?? lesson?.service_id ?? undefined,
            count: reg?.lesson_count ?? lesson?.lesson_count,
            start: reg?.start_time.slice(0, 5) ?? lesson?.start_time.slice(0, 5) ?? "08:00",
            note: reg?.note ?? lessonNote,
          }}
        />
      </section>
      {reg?.status === "pending" && (
        <ActionForm
          action={deleteRegistration}
          submitLabel="Slet registrering"
          pendingLabel="Sletter …"
          confirmText="Slet registreringen?"
          primary={false}
        >
          <input type="hidden" name="id" value={reg.id} />
        </ActionForm>
      )}
    </Screen>
  );
}
