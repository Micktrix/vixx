import Link from "next/link";
import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { formatLongDate } from "@/lib/dates";
import { formatDuration, formatSpan } from "@/lib/schedule";
import { REASON_LABEL } from "../kontor/schedule-data";
import { deleteCanWork, deleteOwnLesson, markDone } from "./actions";
import { isLocked, STATUS_LABEL, type Teacher, type TeacherPeriod } from "./teacher-data";

const statusTone = { pending: "neutral", approved: "ok", rejected: "bad" } as const;
const bigButton = "flex h-12 w-full items-center justify-center rounded-[14px] text-[15px] font-bold";

// Dagspanelet under lærerens kalender, som i prototypen.
export function DayPanel({
  teacher,
  period,
  date,
  today,
  lessonResources,
}: {
  teacher: Teacher;
  period: TeacherPeriod;
  date: string;
  today: string;
  lessonResources: Record<string, string>; // lektions-id → bil/lokale
}) {
  const locked = isLocked(period, date);
  const future = date > today;
  const regs = period.registrations.filter((r) => r.date === date);
  const registeredLessonIds = new Set(regs.map((r) => r.scheduledLessonId));
  const open = period.lessons.filter((l) => l.date === date && !registeredLessonIds.has(l.id));
  const absences = period.absences.filter((a) => a.date === date);
  const holiday = period.holidays.find((h) => h.from <= date && date <= h.to);
  const canWork = period.canWork.filter((c) => c.date === date);
  const total = regs.filter((r) => r.status !== "rejected").reduce((n, r) => n + r.count, 0);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="day-panel">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{formatLongDate(date)}</h2>
        <span className="text-sm text-muted">
          {total} lek.{total ? ` = ${formatDuration(total * teacher.lessonMinutes)}` : ""}
        </span>
      </div>

      {absences.map((a) => (
        <p key={a.id} className="rounded-xl bg-bad-bg px-3.5 py-2.5 text-sm text-bad">
          <b>
            Fravær {formatSpan(a)} · {REASON_LABEL[a.reason]}
          </b>
          <span className="block text-[13px]">Registreret af kontoret</span>
        </p>
      ))}
      {holiday && (
        <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">
          {holiday.status === "approved" ? "Du har ferie denne dag." : "Ferie anmodet. Afventer kontoret."}
        </p>
      )}
      {locked && <p className="rounded-xl bg-soft px-3.5 py-2.5 text-sm">Lønperioden er låst. Kontakt kontoret, hvis noget skal rettes.</p>}

      {teacher.onRequest && date >= today && holiday?.status !== "approved" && !locked && (
        <div className="flex flex-col gap-2 rounded-xl border border-ok/30 bg-ok-bg px-3.5 py-3">
          {canWork.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <b>Kan arbejde {formatSpan(c)}</b>
              <ActionForm action={deleteCanWork} submitLabel="Fjern" pendingLabel="…" primary={false} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
              </ActionForm>
            </div>
          ))}
          <Link href={`/laerer/kan-arbejde?dato=${date}`} className={`${bigButton} border border-ok/40 bg-surface text-ok`}>
            {canWork.length ? "+ Jeg kan arbejde i et andet tidsrum" : "Jeg kan arbejde"}
          </Link>
        </div>
      )}

      {regs.map((r) => {
        const editable = !locked && r.status !== "approved";
        const body = (
          <>
            <span className="flex min-w-0 flex-col">
              <span>
                <span className="text-muted">{formatSpan(r)}</span> <b>{r.serviceName}</b>
              </span>
              {!r.scheduledLessonId && (
                <span>
                  <Pill tone="accent">Uplanlagt</Pill>
                </span>
              )}
              {r.note && <span className="text-[13px] text-muted">Note: {r.note}</span>}
              {r.status === "rejected" && r.comment && <span className="text-[13px] text-bad">Kontoret: {r.comment}</span>}
              {r.officeEdited && <span className="text-[13px] text-muted">Rettet af kontoret</span>}
              {editable && (
                <span className="text-[13px] font-semibold text-accent-ink">
                  {r.status === "rejected" ? "Tryk for at rette og sende igen" : "Tryk for at rette"}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
              {r.count} lek.
              <Pill tone={statusTone[r.status]}>{STATUS_LABEL[r.status]}</Pill>
            </span>
          </>
        );
        const cls = "flex items-start justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-[15px]";
        return editable ? (
          <Link key={r.id} href={`/laerer/registrer?id=${r.id}`} className={`${cls} hover:border-accent`} data-testid="registration">
            {body}
          </Link>
        ) : (
          <div key={r.id} className={cls} data-testid="registration">
            {body}
          </div>
        );
      })}

      {open.map((l) => (
        <div
          key={l.id}
          className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
            l.origin === "instructor" ? "border-line bg-bg" : "border-accent-line bg-accent-bg"
          }`}
          data-testid="planned"
        >
          <span className="flex min-w-0 flex-col text-[15px]">
            <span className="text-[12px] font-semibold text-muted">
              {l.origin === "instructor" ? "Planlagt af dig" : "Planlagt af kontoret"}
            </span>
            <span>
              <b>{formatSpan(l)}</b> · {l.serviceName} · {l.count} lek.
              {lessonResources[l.id] && ` · ${lessonResources[l.id]}`}
            </span>
            {l.studentName && <span className="text-[13px] text-muted">Elev: {l.studentName}</span>}
            {l.note && <span className="text-[13px] text-muted">Note: {l.note}</span>}
          </span>
          {!locked && !future && (
            <ActionForm action={markDone} submitLabel="Udført" pendingLabel="…" className="flex flex-col items-end gap-1">
              <input type="hidden" name="lessonId" value={l.id} />
            </ActionForm>
          )}
          {!locked && future && l.origin === "instructor" && (
            <span className="flex shrink-0 items-start gap-2">
              <Link
                href={`/laerer/planlaeg?id=${l.id}`}
                className="inline-flex h-10 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold"
              >
                Ret
              </Link>
              <ActionForm
                action={deleteOwnLesson}
                submitLabel="Fjern"
                pendingLabel="…"
                primary={false}
                confirmText="Fjern lektionen?"
                className="flex flex-col items-end gap-1"
              >
                <input type="hidden" name="id" value={l.id} />
              </ActionForm>
            </span>
          )}
        </div>
      ))}

      {!regs.length && !open.length && !holiday && !absences.length && (
        <p className="text-sm text-muted">Intet planlagt eller registreret.</p>
      )}

      {!locked && holiday?.status !== "approved" && (
        <>
          <Link
            href={future ? `/laerer/planlaeg?dato=${date}` : `/laerer/registrer?dato=${date}`}
            className={`${bigButton} border border-accent bg-accent text-ink`}
          >
            {future ? "+ Planlæg lektion" : "+ Tilføj lektioner"}
          </Link>
          {future && (
            <p className="text-[13px] text-muted">
              Lektioner frem i tiden lægges i kalenderen, så kontoret kan se, at du er optaget. Tryk &quot;Udført&quot;, når de er kørt.
            </p>
          )}
        </>
      )}
    </section>
  );
}
