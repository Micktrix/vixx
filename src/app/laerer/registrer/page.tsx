import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/form";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { formatSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { deleteRegistration, saveRegistration } from "../lesson-actions";
import { TeacherLessonForm } from "../lesson-form";
import { Screen } from "../screen";
import { allowedServices, getTeacher, isLocked, loadTeacherPeriod } from "../teacher-data";

// Tilføj kørte lektioner (i dag eller tidligere), eller ret en registrering, der ikke er godkendt.
export default async function RegisterPage({ searchParams }: PageProps<"/laerer/registrer">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayDk();

  const id = typeof sp.id === "string" ? sp.id : undefined;
  const { data: reg } = id
    ? await supabase
        .from("registrations")
        .select("id, lesson_date, start_time, lesson_count, service_id, category_code, status, student_name, note, decision_comment")
        .eq("id", id)
        .maybeSingle()
    : { data: null };
  if (id && !reg) notFound();

  const date = reg?.lesson_date ?? parseDateInput(typeof sp.dato === "string" ? sp.dato : "") ?? today;
  if (date > today) redirect(`/laerer/planlaeg?dato=${date}`);

  const [period, services] = await Promise.all([loadTeacherPeriod(teacher, date, date), allowedServices(teacher)]);
  const back = `/laerer?dag=${date}`;
  if (isLocked(period, date) || reg?.status === "approved") redirect(back);

  const busy = period.registrations.filter((r) => r.status !== "rejected" && r.id !== reg?.id);
  const openPlanned = period.lessons.filter((l) => !period.registrations.some((r) => r.scheduledLessonId === l.id));

  return (
    <Screen
      title={reg ? (reg.status === "rejected" ? "Ret og send igen" : "Ret lektion") : "Tilføj lektioner"}
      sub={formatLongDate(date)}
      action={
        <Link href={back} className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        {reg?.status === "rejected" && reg.decision_comment && (
          <p className="rounded-xl bg-bad-bg px-3.5 py-2.5 text-sm text-bad">Kontoret: {reg.decision_comment}</p>
        )}
        {!reg &&
          (openPlanned.length ? (
            <p className="rounded-xl bg-accent-bg px-3.5 py-2.5 text-sm">
              Planlagt i dag: {openPlanned.map((l) => `${formatSpan(l)} ${l.serviceName}`).join(", ")}. Har du kørt den, så tryk
              &quot;Udført&quot; på den i kalenderen i stedet, og ret bagefter, hvis noget var anderledes.
            </p>
          ) : (
            <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">Lektionen står ikke i dit skema. Skriv gerne en kort note til kontoret.</p>
          ))}
        <TeacherLessonForm
          action={saveRegistration}
          submitLabel={reg ? (reg.status === "rejected" ? "Send igen" : "Gem ændringer") : "Gem lektioner"}
          services={services}
          lessonMinutes={teacher.lessonMinutes}
          busy={busy}
          hiddenFields={{ date, ...(reg ? { id: reg.id } : {}) }}
          initial={{
            serviceId: reg?.service_id,
            category: reg?.category_code,
            count: reg?.lesson_count,
            start: reg?.start_time.slice(0, 5) ?? "08:00",
            studentName: reg?.student_name ?? undefined,
            note: reg?.note ?? undefined,
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
