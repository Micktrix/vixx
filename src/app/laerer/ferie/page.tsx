import Link from "next/link";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { formatDate, todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { cancelHoliday, requestHoliday } from "../self-service-actions";
import { Screen } from "../screen";
import { getTeacher } from "../teacher-data";

const LABEL = { pending: "Afventer", approved: "Godkendt", rejected: "Afvist" } as const;
const TONE = { pending: "neutral", approved: "ok", rejected: "bad" } as const;

export default async function HolidayRequestPage() {
  const teacher = await getTeacher();
  const today = todayDk();
  const supabase = await createClient();
  const { data: holidays } = await supabase
    .from("holidays")
    .select("id, from_date, to_date, status, note")
    .eq("instructor_id", teacher.instructorId)
    .gte("to_date", today)
    .order("from_date");

  return (
    <Screen
      title="Ferie"
      sub="Kontoret godkender din anmodning"
      action={
        <Link href="/laerer/overblik" className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 className="mb-3 text-lg font-bold">Anmod om ferie</h2>
        <ActionForm action={requestHoliday} submitLabel="Send anmodning" pendingLabel="Sender …">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Fra" name="from" type="date" min={today} required />
            <TextField label="Til" name="to" type="date" min={today} required />
          </div>
          <TextField label="Note (valgfri)" name="note" maxLength={200} placeholder="Fx efterårsferie" />
        </ActionForm>
      </section>

      <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 className="text-lg font-bold">Din kommende ferie</h2>
        {(holidays ?? []).map((h) => (
          <div key={h.id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0" data-testid="own-holiday">
            <span className="flex flex-col">
              <span>
                {formatDate(h.from_date)} – {formatDate(h.to_date)}
              </span>
              {h.note && <span className="text-[13px] text-muted">{h.note}</span>}
            </span>
            <span className="flex items-center gap-2">
              <Pill tone={TONE[h.status as keyof typeof TONE]}>{LABEL[h.status as keyof typeof LABEL]}</Pill>
              {h.status === "pending" && (
                <ActionForm
                  action={cancelHoliday}
                  submitLabel="Træk tilbage"
                  pendingLabel="…"
                  primary={false}
                  confirmText="Træk ferieanmodningen tilbage?"
                  className="flex flex-col items-end gap-1"
                >
                  <input type="hidden" name="id" value={h.id} />
                </ActionForm>
              )}
            </span>
          </div>
        ))}
        {!holidays?.length && <p className="text-sm text-muted">Ingen kommende ferie.</p>}
      </section>
    </Screen>
  );
}
