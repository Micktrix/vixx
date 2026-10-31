import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, CheckChip, Fieldset, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { TIME_SLOTS } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { calendarHref } from "../calendar/params";
import { loadSchedule, REASON_LABEL } from "../schedule-data";
import { deleteAbsence, saveAbsence } from "./actions";

export default async function AbsencePage({ searchParams }: PageProps<"/kontor/fravaer">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const supabase = await createClient();

  const absenceId = one("id");
  const { data: absence } = absenceId
    ? await supabase
        .from("absences")
        .select("id, instructor_id, absence_date, start_time, hours, reason, note")
        .eq("id", absenceId)
        .eq("school_id", membership.schoolId)
        .maybeSingle()
    : { data: null };
  if (absenceId && !absence) notFound();

  const date = absence?.absence_date ?? parseDateInput(one("dato") ?? "") ?? todayDk();
  const schedule = await loadSchedule(membership.schoolId, date, date);
  const instructorId = absence?.instructor_id ?? one("laerer") ?? "";

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={calendarHref({ view: "dag", date })} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Kalender {formatLongDate(date)}
        </Link>
        <h1 className="text-[30px] font-bold">{absence ? "Ret fravær" : "Fravær"}</h1>
        <p className="text-muted">Fravær blokerer tiden og tæller aldrig i lønnen.</p>
      </header>

      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={saveAbsence} submitLabel={absence ? "Gem ændringer" : "Gem fravær"} className="flex flex-col gap-5">
          {absence && <input type="hidden" name="id" value={absence.id} />}
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Underviser
            <select name="instructorId" defaultValue={instructorId} required className={inputClass}>
              <option value="" disabled>
                Vælg underviser
              </option>
              {schedule.instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <Fieldset legend="Årsag">
            {(Object.keys(REASON_LABEL) as (keyof typeof REASON_LABEL)[]).map((r) => (
              <CheckChip
                key={r}
                type="radio"
                name="reason"
                value={r}
                label={REASON_LABEL[r]}
                required
                defaultChecked={(absence?.reason ?? "sick") === r}
              />
            ))}
          </Fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Dato" name="date" type="date" required defaultValue={date} />
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Fra kl.
              <select name="start" defaultValue={absence?.start_time.slice(0, 5) ?? "08:00"} className={inputClass}>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Antal timer"
              name="hours"
              inputMode="decimal"
              required
              defaultValue={absence ? String(absence.hours).replace(".", ",") : "8"}
              hint="Fx 8 eller 2,5"
            />
          </div>
          <TextField label="Note (valgfri)" name="note" defaultValue={absence?.note ?? ""} maxLength={300} />
        </ActionForm>
      </section>

      {absence && (
        <ActionForm
          action={deleteAbsence}
          submitLabel="Fjern fravær"
          pendingLabel="Fjerner …"
          confirmText="Fjern fraværet?"
          primary={false}
        >
          <input type="hidden" name="id" value={absence.id} />
        </ActionForm>
      )}
    </>
  );
}
