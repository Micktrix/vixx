import Link from "next/link";
import { notFound } from "next/navigation";
import { TextField } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { formatLongDate } from "@/lib/dates";
import { lessonSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { TeacherLessonForm } from "../../../laerer/lesson-form";
import { officeSaveRegistration } from "../actions";

type ServiceRow = {
  id: string;
  name: string;
  lesson_type_id: string;
  rate_groups: { name: string; active: boolean } | null;
  service_categories: { category_code: string }[];
};

// Kontoret retter en registrering. Er den ikke godkendt, godkendes den samtidig ("Ret og godkend").
export default async function OfficeEditRegistrationPage({ searchParams }: PageProps<"/kontor/godkendelser/ret">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: reg } = await supabase
    .from("registrations")
    .select(
      "id, instructor_id, lesson_date, start_time, lesson_count, lesson_minutes, service_id, category_code, status, student_name, note, decision_comment, instructors(school_members(profiles(full_name)), instructor_categories(category_code), instructor_lesson_types(lesson_type_id))",
    )
    .eq("id", typeof sp.id === "string" ? sp.id : "")
    .eq("school_id", membership.schoolId)
    .maybeSingle();
  if (!reg) notFound();

  const instructor = reg.instructors as unknown as {
    school_members: { profiles: { full_name: string } | null } | null;
    instructor_categories: { category_code: string }[];
    instructor_lesson_types: { lesson_type_id: string }[];
  };
  const cats = instructor.instructor_categories.map((c) => c.category_code);
  const types = instructor.instructor_lesson_types.map((t) => t.lesson_type_id);

  const [{ data: services }, { data: others }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, lesson_type_id, rate_groups(name, active), service_categories(category_code)")
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("registrations")
      .select("start_time, lesson_count, lesson_minutes")
      .eq("instructor_id", reg.instructor_id)
      .eq("lesson_date", reg.lesson_date)
      .neq("status", "rejected")
      .neq("id", reg.id),
  ]);

  // Kun ydelser, læreren har kompetence til (typen og mindst én af ydelsens kategorier).
  const allowed = ((services ?? []) as unknown as ServiceRow[])
    .filter((s) => s.rate_groups?.active && types.includes(s.lesson_type_id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      groupName: s.rate_groups?.name ?? "",
      categories: s.service_categories.map((c) => c.category_code).filter((c) => cats.includes(c)),
    }))
    .filter((s) => s.categories.length);

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
          services={allowed}
          lessonMinutes={reg.lesson_minutes}
          busy={(others ?? []).map((o) => lessonSpan(o.start_time, o.lesson_count, o.lesson_minutes))}
          hiddenFields={{ id: reg.id }}
          initial={{
            serviceId: reg.service_id,
            category: reg.category_code,
            count: reg.lesson_count,
            start: reg.start_time.slice(0, 5),
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
