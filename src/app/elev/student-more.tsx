import { CalendarBox } from "@/components/calendar-box";
import { signOut } from "@/lib/auth/actions";
import { formatPhone } from "@/lib/phone";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../laerer/screen";
import { newStudentCalendarLink } from "./actions";

type Contact = { name: string; phone: string | null; is_school: boolean };

// Mere: kontakt til skolen og de faste lærere, kalender i telefonen og log ud. Bruges også af demo-eleven.
export async function StudentMore({
  schoolId,
  studentId,
  name,
  phone,
  demo = false,
}: {
  schoolId: string;
  studentId: string;
  name: string;
  phone: string;
  demo?: boolean;
}) {
  const supabase = await createClient();
  const [{ data: student }, { data: contacts }] = await Promise.all([
    supabase.from("students").select("calendar_token").eq("id", studentId).maybeSingle(),
    supabase.rpc("student_contacts", { p_school: schoolId, ...(demo ? { p_student: studentId } : {}) }),
  ]);
  if (!student) return null;
  const people = ((contacts ?? []) as Contact[]).filter((c) => c.phone || !c.is_school);

  return (
    <Screen title="Mere" sub={name}>
      <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="student-contacts">
        <h2 className="font-bold">Kontakt</h2>
        {people.map((c) => (
          <div key={`${c.is_school}-${c.name}`} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-b-0">
            <span>
              <b>{c.name}</b>
              <span className="block text-[13px] text-muted">{c.is_school ? "Kontoret" : "Din kørelærer"}</span>
            </span>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="rounded-xl border border-line2 px-3 py-1.5 text-sm font-semibold">
                Ring {formatPhone(c.phone)}
              </a>
            )}
          </div>
        ))}
        {!people.length && <p className="text-sm text-muted">Kontakt kontoret, hvis du har spørgsmål.</p>}
      </section>

      <CalendarBox
        httpsUrl={`${await siteOrigin()}/kalender/${student.calendar_token}.ics`}
        intro="Dine kørelektioner vises i telefonens egen kalender og opdateres af sig selv."
        newLink={demo ? undefined : newStudentCalendarLink}
      />

      <section className="flex flex-col gap-1 rounded-[20px] border border-line bg-surface p-[18px] text-[15px]">
        <h2 className="font-bold">Dig</h2>
        <p>{name}</p>
        {!demo && <p className="text-muted">{formatPhone(phone)}</p>}
        {!demo && (
          <form action={signOut} className="mt-2">
            <button type="submit" className="font-semibold text-accent-ink underline underline-offset-[3px]">
              Log ud
            </button>
          </form>
        )}
      </section>
    </Screen>
  );
}
