import Link from "next/link";
import { ActionForm } from "@/components/form";
import { formatLongDate, formatShortDay, todayDk } from "@/lib/dates";
import { formatSpan, storedSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../laerer/screen";
import { cancelRequest, requestSlot } from "./actions";

type Item = {
  kind: "lesson" | "request";
  id: string;
  lesson_date: string;
  start_time: string;
  span_minutes: number;
  lesson_count: number;
  instructor_name: string;
  service_name: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | null;
  cancel_before: string | null;
  request_id: string | null;
};
type Slot = { id: string; slot_date: string; start_time: string; span_minutes: number; lesson_count: number; instructor_name: string };

const card = "flex flex-col gap-2 rounded-[16px] border bg-surface px-4 py-3";
const span = (i: { start_time: string; span_minutes: number }) => formatSpan(storedSpan(i.start_time, i.span_minutes));

// Elevens kalender: kommende lektioner (bookede og planlagte af skolen), anmodninger, ledige tider hos de
// faste lærere (kun for elever med lov) og de kørte lektioner. Bruges af elevens app og af demo-eleven, hvor
// admin handler på elevens vegne (demo).
export async function StudentCalendar({
  schoolId,
  schoolName,
  studentId,
  demo = false,
  forloebHref = "/elev",
}: {
  schoolId: string;
  schoolName: string;
  studentId: string;
  demo?: boolean;
  forloebHref?: string;
}) {
  const supabase = await createClient();
  const who = { p_school: schoolId, ...(demo ? { p_student: studentId } : {}) };
  const [{ data: student }, { data: items }, { data: slots }] = await Promise.all([
    supabase
      .from("students")
      .select("can_request, student_instructors(instructor_id), lesson_signoffs(id, lesson_number, lesson_date, instructor_name)")
      .eq("id", studentId)
      .maybeSingle(),
    supabase.rpc("student_lessons", who),
    supabase.rpc("student_open_slots", who),
  ]);
  const hidden = demo ? <input type="hidden" name="student" value={studentId} /> : null;
  const today = todayDk();
  const all = (items ?? []) as Item[];
  const upcoming = all.filter((i) => i.kind === "lesson" && i.lesson_date >= today);
  const requests = all.filter((i) => i.kind === "request");
  const open = (slots ?? []) as Slot[];
  const driven = ((student?.lesson_signoffs ?? []) as { id: string; lesson_number: string; lesson_date: string; instructor_name: string }[]).sort(
    (a, b) => b.lesson_date.localeCompare(a.lesson_date),
  );
  const now = new Date().toISOString();

  return (
    <Screen title="Kalender" sub={schoolName}>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Dine lektioner</h2>
        {!upcoming.length && <p className="text-sm text-muted">Du har ingen kommende lektioner.</p>}
        {upcoming.map((l) => (
          <div key={l.id} className={`${card} border-line`} data-testid="student-upcoming">
            <span>
              <b>{formatLongDate(l.lesson_date)}</b>
              <span className="block text-[15px]">
                {span(l)} · {l.instructor_name}
              </span>
              {l.service_name && <span className="block text-[13px] text-muted">{l.service_name}</span>}
            </span>
            {l.status === "approved" &&
              (l.cancel_before && l.cancel_before > now ? (
                <ActionForm
                  action={cancelRequest}
                  submitLabel="Meld afbud"
                  pendingLabel="…"
                  primary={false}
                  confirmText="Meld afbud til lektionen?"
                >
                  <input type="hidden" name="id" value={l.request_id ?? ""} />
                  {hidden}
                </ActionForm>
              ) : (
                <span className="text-[13px] text-muted">Afbud nu kun via kontoret.</span>
              ))}
          </div>
        ))}
      </section>

      {requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Dine anmodninger</h2>
          {requests.map((r) => (
            <div key={r.id} className={`${card} ${r.status === "rejected" ? "border-bad/30" : "border-accent-line"}`} data-testid="student-request">
              <span>
                <b>
                  {formatShortDay(r.lesson_date)} · {span(r)}
                </b>
                <span className="block text-[13px] text-muted">{r.instructor_name}</span>
              </span>
              {r.status === "pending" ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-accent-ink">Venter på svar</span>
                  <ActionForm action={cancelRequest} submitLabel="Træk tilbage" pendingLabel="…" primary={false}>
                    <input type="hidden" name="id" value={r.id} />
                    {hidden}
                  </ActionForm>
                </div>
              ) : (
                <span className="text-sm font-semibold text-bad">Afvist. Prøv en anden tid.</span>
              )}
            </div>
          ))}
        </section>
      )}

      {student?.can_request && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Ledige tider</h2>
          {!(student.student_instructors ?? []).length ? (
            <p className="text-sm text-muted">Du har endnu ingen faste lærere. Kontakt kontoret.</p>
          ) : !open.length ? (
            <p className="text-sm text-muted">Dine lærere har ingen ledige tider lige nu. Kig forbi igen senere.</p>
          ) : (
            open.map((s) => (
              <div key={s.id} className={`${card} border-ok/30`} data-testid="open-slot">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <b>
                      {formatShortDay(s.slot_date)} · {span(s)}
                    </b>
                    <span className="block text-[13px] text-muted">
                      {s.instructor_name} · {s.lesson_count} lektioner
                    </span>
                  </span>
                  <ActionForm action={requestSlot} submitLabel="Anmod" pendingLabel="…">
                    <input type="hidden" name="id" value={s.id} />
                    {hidden}
                  </ActionForm>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Kørte lektioner</h2>
        {!driven.length && <p className="text-sm text-muted">Når din kørelærer har kvitteret for en lektion, står den her.</p>}
        {driven.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-[14px] border border-line bg-surface px-4 py-2.5 text-[15px]">
            <span>
              <b>Lektion {d.lesson_number}</b>
              <span className="block text-[13px] text-muted">{d.instructor_name}</span>
            </span>
            <span className="text-sm text-muted">{formatShortDay(d.lesson_date)}</span>
          </div>
        ))}
        <Link href={forloebHref} className="text-center text-sm font-semibold text-accent-ink underline underline-offset-[3px]">
          Se hele forløbet
        </Link>
      </section>
    </Screen>
  );
}

