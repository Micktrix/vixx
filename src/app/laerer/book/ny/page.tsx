import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { loadBookings, loadResources } from "@/lib/booking-data";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { formatSpan, fromMinutes, TIME_SLOTS, toMinutes } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../../screen";
import { getTeacher } from "../../teacher-data";
import { deleteOwnBooking, saveOwnBooking } from "../actions";

export default async function NewBookingPage({ searchParams }: PageProps<"/laerer/book/ny">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const supabase = await createClient();
  const today = todayDk();

  const { data: booking } = one("id")
    ? await supabase
        .from("bookings")
        .select("id, resource_id, booking_date, start_time, minutes, title, instructor_id, scheduled_lesson_id")
        .eq("id", one("id"))
        .eq("instructor_id", teacher.instructorId)
        .is("scheduled_lesson_id", null)
        .maybeSingle()
    : { data: null };
  if (one("id") && !booking) notFound();

  const date = booking?.booking_date ?? parseDateInput(one("dato")) ?? today;
  if (date < today) redirect(`/laerer/book?dato=${date}`);
  const resourceId = booking?.resource_id ?? one("ressource");
  const [resources, bookings] = await Promise.all([
    loadResources(teacher.membership.schoolId),
    loadBookings(teacher.membership.schoolId, date, date),
  ]);
  const resource = resources.find((r) => r.id === resourceId);
  if (!resource) notFound();
  const taken = bookings.filter((b) => b.resourceId === resource.id && b.id !== booking?.id);
  const start = booking?.start_time.slice(0, 5) ?? "08:00";
  const end = booking ? fromMinutes(toMinutes(start) + booking.minutes) : "09:00";
  const back = `/laerer/book?dato=${date}&type=${resource.kind}`;

  return (
    <Screen
      title={booking ? "Ret booking" : `Book ${resource.name}`}
      sub={formatLongDate(date)}
      action={
        <Link href={back} className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        {taken.length > 0 && (
          <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">
            Optaget: {taken.map((b) => formatSpan(b)).join(", ")}
          </p>
        )}
        <ActionForm action={saveOwnBooking} submitLabel={booking ? "Gem ændringer" : "Book"}>
          {booking && <input type="hidden" name="id" value={booking.id} />}
          <input type="hidden" name="resourceId" value={resource.id} />
          <input type="hidden" name="date" value={date} />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Fra kl.
              <select name="start" defaultValue={start} className={inputClass}>
                {TIME_SLOTS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Til kl.
              <select name="end" defaultValue={end} className={inputClass}>
                {TIME_SLOTS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <TextField label="Titel (valgfri)" name="title" defaultValue={booking?.title ?? ""} maxLength={80} placeholder="Fx forberedelse" />
        </ActionForm>
      </section>
      {booking && (
        <ActionForm action={deleteOwnBooking} submitLabel="Slet booking" pendingLabel="Sletter …" confirmText="Slet bookingen?" primary={false}>
          <input type="hidden" name="id" value={booking.id} />
        </ActionForm>
      )}
    </Screen>
  );
}
