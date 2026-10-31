import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { loadResources } from "@/lib/booking-data";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { fromMinutes, TIME_SLOTS, toMinutes } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { planHref } from "../calendar/params";
import { loadSchedule } from "../schedule-data";
import { deleteBooking, saveBooking } from "./actions";

export default async function OfficeBookingPage({ searchParams }: PageProps<"/kontor/booking">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const supabase = await createClient();
  const today = todayDk();

  const { data: booking } = one("id")
    ? await supabase
        .from("bookings")
        .select("id, resource_id, booking_date, start_time, minutes, title, instructor_id, scheduled_lesson_id")
        .eq("id", one("id"))
        .eq("school_id", membership.schoolId)
        .maybeSingle()
    : { data: null };
  if (one("id") && !booking) notFound();

  const date = booking?.booking_date ?? parseDateInput(one("dato")) ?? today;
  const [resources, schedule] = await Promise.all([loadResources(membership.schoolId), loadSchedule(membership.schoolId, date, date)]);
  const start = booking?.start_time.slice(0, 5) ?? (TIME_SLOTS.includes(one("start")) ? one("start") : "08:00");
  const end = booking ? fromMinutes(toMinutes(start) + booking.minutes) : fromMinutes(Math.min(toMinutes(start) + 60, 22 * 60));
  const resourceId = booking?.resource_id ?? one("ressource");
  const kind = resources.find((r) => r.id === resourceId)?.kind;
  const back = `${kind === "vehicle" ? "/kontor/koeretoejer" : "/kontor/lokaler"}?vis=dag&dato=${date}`;

  if (booking?.scheduled_lesson_id) {
    return (
      <>
        <header className="flex flex-col gap-1">
          <Link href={back} className="text-sm font-semibold text-muted hover:text-ink">‹ Tilbage</Link>
          <h1 className="text-[30px] font-bold">Booking til en lektion</h1>
        </header>
        <p className="rounded-[20px] border border-line bg-surface p-[18px]">
          Bookingen hører til en planlagt lektion og følger den, når den flyttes. Skift eller fjern lokale/køretøj på lektionen.{" "}
          <Link href={planHref({ lesson: booking.scheduled_lesson_id })} className="font-semibold text-accent-ink underline underline-offset-[3px]">
            Åbn lektionen
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={back} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ {formatLongDate(date)}
        </Link>
        <h1 className="text-[30px] font-bold">{booking ? "Ret booking" : "Book lokale eller køretøj"}</h1>
      </header>

      <section className="max-w-[640px] rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={saveBooking} submitLabel={booking ? "Gem ændringer" : "Book"} className="flex flex-col gap-4">
          {booking && <input type="hidden" name="id" value={booking.id} />}
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Lokale eller køretøj
            <select name="resourceId" defaultValue={resourceId} required className={inputClass}>
              <option value="" disabled>Vælg</option>
              <optgroup label="Lokaler">
                {resources.filter((r) => r.kind === "room").map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
              <optgroup label="Køretøjer">
                {resources.filter((r) => r.kind === "vehicle").map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.category ? ` (${r.category})` : ""}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Dato" name="date" type="date" required defaultValue={date} />
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
          <TextField label="Titel (valgfri)" name="title" defaultValue={booking?.title ?? ""} maxLength={80} placeholder="Fx teoriaften eller service" />
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Underviser (valgfri)
            <select name="instructorId" defaultValue={booking?.instructor_id ?? ""} className={inputClass}>
              <option value="">Ingen</option>
              {schedule.instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </label>
        </ActionForm>
      </section>

      {booking && (
        <ActionForm action={deleteBooking} submitLabel="Slet booking" pendingLabel="Sletter …" confirmText="Slet bookingen?" primary={false}>
          <input type="hidden" name="id" value={booking.id} />
        </ActionForm>
      )}
    </>
  );
}
