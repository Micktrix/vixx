import Link from "next/link";
import { ActionForm, TextField } from "@/components/form";
import { ServiceOptions } from "@/components/service-options";
import { inputClass } from "@/components/styles";
import { formatShortDay, todayDk } from "@/lib/dates";
import { formatSpan, storedSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../screen";
import { allowedServices, getTeacher } from "../teacher-data";
import { answerRequest, openSlot, removeSlot } from "./actions";

type Request = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  students: { service_id: string | null; profiles: { full_name: string } | null } | null;
};

// Åbne tider: læreren åbner tider, som eleverne kan anmode om, og svarer på anmodningerne.
export default async function OpenSlotsPage() {
  const teacher = await getTeacher();
  const supabase = await createClient();
  const today = todayDk();
  const [{ data: slots }, services] = await Promise.all([
    supabase
      .from("open_slots")
      .select("id, slot_date, start_time, span_minutes, lesson_count, lesson_requests(id, status, students(service_id, profiles(full_name)))")
      .eq("instructor_id", teacher.instructorId)
      .gte("slot_date", today)
      .order("slot_date")
      .order("start_time"),
    allowedServices(teacher),
  ]);

  return (
    <Screen
      title="Åbne tider"
      sub="Tider dine elever kan anmode om"
      action={
        <Link href="/laerer" className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={openSlot} submitLabel="Åbn tid" className="flex flex-col gap-3">
          <TextField label="Dato" name="date" type="date" required min={today} defaultValue={today} />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Start
              <select name="start" required defaultValue={teacher.plan.starts[0]} className={inputClass}>
                {teacher.plan.starts.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Lektioner
              <select name="count" defaultValue="2" className={inputClass}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[13px] text-muted">
            Kun elever, der har dig som fast lærer og må anmode, kan se tiden. Du er først optaget, når du godkender en anmodning.
          </p>
        </ActionForm>
      </section>

      {!slots?.length && <p className="text-center text-sm text-muted">Du har ingen åbne tider.</p>}

      <ul className="flex flex-col gap-2" data-testid="open-slots">
        {(slots ?? []).map((s) => {
          const requests = (s.lesson_requests ?? []) as unknown as Request[];
          const active = requests.find((r) => r.status === "pending" || r.status === "approved");
          const name = active?.students?.profiles?.full_name ?? "";
          return (
            <li key={s.id} className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <span>
                  <b>
                    {formatShortDay(s.slot_date)} · {formatSpan(storedSpan(s.start_time, s.span_minutes))}
                  </b>
                  <span className="block text-[13px] text-muted">{s.lesson_count} lektioner</span>
                </span>
                {!active ? (
                  <ActionForm action={removeSlot} submitLabel="Fjern" pendingLabel="…" primary={false} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                  </ActionForm>
                ) : (
                  <span className={`text-sm font-semibold ${active.status === "approved" ? "text-ok" : "text-accent-ink"}`}>
                    {active.status === "approved" ? "Booket" : "Anmodet"}
                  </span>
                )}
              </div>
              {!active && <span className="text-sm text-muted">Åben</span>}
              {active?.status === "approved" && <span className="text-sm">{name}</span>}
              {active?.status === "pending" && (
                <div className="flex flex-col gap-2 rounded-xl bg-accent-bg p-3" data-testid="pending-request">
                  <span className="text-sm">
                    <b>{name}</b> vil gerne have tiden.
                  </span>
                  <ActionForm action={answerRequest} submitLabel="Godkend" pendingLabel="…" className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={active.id} />
                    <input type="hidden" name="answer" value="approve" />
                    <label className="flex flex-col gap-1 text-[13px] font-bold">
                      Ydelse
                      <select name="serviceId" required defaultValue={active.students?.service_id ?? ""} className={inputClass}>
                        <option value="" disabled>
                          Vælg ydelse
                        </option>
                        <ServiceOptions services={services} />
                      </select>
                    </label>
                  </ActionForm>
                  <ActionForm action={answerRequest} submitLabel="Afvis" pendingLabel="…" primary={false}>
                    <input type="hidden" name="id" value={active.id} />
                    <input type="hidden" name="answer" value="reject" />
                  </ActionForm>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
