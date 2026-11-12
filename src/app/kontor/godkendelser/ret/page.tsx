import Link from "next/link";
import { notFound } from "next/navigation";
import { TextField } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { formatLongDate } from "@/lib/dates";
import { storedSpan, toPlan } from "@/lib/schedule";
import { loadStudentOptions } from "@/lib/student-options";
import { createClient } from "@/lib/supabase/server";
import { TeacherLessonForm } from "../../../laerer/lesson-form";
import { officeSaveRegistration } from "../actions";

// Kontoret retter en registrering. Er den ikke godkendt, godkendes den samtidig ("Ret og godkend").
export default async function OfficeEditRegistrationPage({ searchParams }: PageProps<"/kontor/godkendelser/ret">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: reg } = await supabase
    .from("registrations")
    .select(
      "id, instructor_id, lesson_date, start_time, lesson_count, lesson_minutes, span_minutes, service_id, status, student_id, student_name, note, decision_comment, instructors(school_members(profiles(full_name)))",
    )
    .eq("id", typeof sp.id === "string" ? sp.id : "")
    .eq("school_id", membership.schoolId)
    .maybeSingle();
  if (!reg) notFound();

  const instructor = reg.instructors as unknown as {
    school_members: { profiles: { full_name: string } | null } | null;
  };

  const [{ data: services }, { data: others }, { data: school }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, break_after")
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("registrations")
      .select("start_time, lesson_count, lesson_minutes, span_minutes")
      .eq("instructor_id", reg.instructor_id)
      .eq("lesson_date", reg.lesson_date)
      .neq("status", "rejected")
      .neq("id", reg.id),
    supabase.from("schools").select("lesson_starts").eq("id", membership.schoolId).single(),
  ]);
  // Planens starttider. En ældre registrering uden for planen kan beholde sin starttid.
  const plan = toPlan(school?.lesson_starts, reg.lesson_minutes);
  const regStart = reg.start_time.slice(0, 5);
  if (!plan.starts.includes(regStart)) plan.starts = [...plan.starts, regStart].sort();


  const approved = reg.status === "approved";

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={`/kontor/godkendelser?status=${reg.status}`} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Godkendelser
        </Link>
        <h1 className="text-[30px] font-bold">{approved ? "Ret godkendt lektion" : "Ret og godkend"}</h1>
        <p className="text-muted">
          {instructor.school_members?.profiles?.full_name} · {formatLongDate(reg.lesson_date)}
        </p>
      </header>

      <section className="flex max-w-[560px] flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        {reg.status === "rejected" && reg.decision_comment && (
          <p className="rounded-xl bg-bad-bg px-3.5 py-2.5 text-sm text-bad">Afvist: {reg.decision_comment}</p>
        )}
        <TeacherLessonForm
          action={officeSaveRegistration}
          submitLabel={approved ? "Gem" : "Gem og godkend"}
          services={(services ?? []).map((s) => ({ id: s.id, name: s.name, breakAfter: s.break_after }))}
          plan={plan}
          busy={(others ?? []).map((o) => storedSpan(o.start_time, o.span_minutes))}
          hiddenFields={{ id: reg.id }}
          students={await loadStudentOptions(membership.schoolId, reg.instructor_id)}
          initial={{
            serviceId: reg.service_id,
            count: reg.lesson_count,
            start: reg.start_time.slice(0, 5),
            studentId: reg.student_id ?? undefined,
            studentName: reg.student_name ?? undefined,
            note: reg.note ?? undefined,
          }}
        >
          <TextField
            label="Besked til læreren (valgfri)"
            name="message"
            maxLength={200}
            hint="Læreren får besked om rettelsen i appen."
          />
        </TeacherLessonForm>
        {approved && (
          <p className="text-[13px] text-muted">
            Prisen er låst ved godkendelsen. Ændrer du ydelsen, låses prisen for den nye ydelse på lektionens dato.
          </p>
        )}
      </section>
    </>
  );
}
