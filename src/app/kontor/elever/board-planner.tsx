"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { formatDate, formatLongDate } from "@/lib/dates";
import { planSlotIsFree, type LessonPlan, type Span } from "@/lib/schedule";
import { addAppointment, boardDay, cancelBoardPlan, planFromBoard } from "./actions";

// Planlæg fra holdtavlen (trin E11, Michael 27. nov. 2026): tryk på en manglende lektion, EU-køretime eller prøve,
// og planlæg den uden at gå ind på eleven. Lektionen kommer i lærerens og elevens kalender, men er adskilt fra
// lønnen: læreren registrerer stadig selv sine timer.

type Teacher = { id: string; name: string };
type Ctx = { teachers: Teacher[]; plan: LessonPlan; today: string; instructorId?: string; date?: string };
const Planner = createContext<Ctx | null>(null);

// `instructorId`/`date`: valgt på forhånd (lærerens app planlægger for læreren selv på den valgte dag).
export function PlannerProvider({ children, ...ctx }: Ctx & { children: ReactNode }) {
  return <Planner.Provider value={ctx}>{children}</Planner.Provider>;
}

export type PlanTarget =
  | { type: "lesson"; schoolLessonId: string; count: number; label: string }
  | { type: "eu"; euTopicId: string; count: number; label: string }
  | { type: "appointment"; kind: string; label: string };

const primary = "h-11 rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink disabled:opacity-60";
const plain = "h-11 rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold";

// Feltet på tavlen som knap. Uden planlæg-boks (fx en anden side) vises feltet som før.
export function PlanCell({
  studentId,
  studentName,
  target,
  children,
  className = "cursor-pointer rounded-md hover:ring-2 hover:ring-accent",
  planned,
}: {
  studentId: string;
  studentName: string;
  target: PlanTarget;
  children: ReactNode;
  className?: string;
  planned?: { id: string; date: string; start: string; instructor: string }; // allerede planlagt: kan aflyses
}) {
  const ctx = useContext(Planner);
  const [open, setOpen] = useState(false);
  // Den planlagte lektion, som den var, da boksen blev åbnet (tavlen opdateres under den, når man planlægger/aflyser).
  const [shown, setShown] = useState<typeof planned>(undefined);
  if (!ctx) return <>{children}</>;
  return (
    <>
      <button type="button" onClick={() => (setShown(planned), setOpen(true))} className={className} title={`Planlæg ${target.label}`} data-testid="plan-cell" data-plan={target.label}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div
            role="dialog"
            aria-label={`Planlæg ${target.label}`}
            className="flex w-full max-w-[420px] flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px] text-left text-[15px]"
            onClick={(e) => e.stopPropagation()}
            data-testid="plan-dialog"
          >
            <div>
              <h2 className="text-lg font-bold">Planlæg {target.label}</h2>
              <p className="text-[13px] text-muted">{studentName}</p>
            </div>
            {shown ? (
              <CancelForm studentId={studentId} planned={shown} onClose={() => setOpen(false)} />
            ) : target.type === "appointment" ? (
              <AppointmentForm studentId={studentId} kind={target.kind} today={ctx.today} onClose={() => setOpen(false)} />
            ) : (
              <LessonForm studentId={studentId} target={target} ctx={ctx} onClose={() => setOpen(false)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LessonForm({
  studentId,
  target,
  ctx,
  onClose,
}: {
  studentId: string;
  target: Extract<PlanTarget, { type: "lesson" | "eu" }>;
  ctx: Ctx;
  onClose: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(planFromBoard);
  const [instructorId, setInstructorId] = useState(ctx.instructorId ?? "");
  const [date, setDate] = useState(ctx.date ?? ctx.today);
  const [start, setStart] = useState("");
  const [fetched, setFetched] = useState<{ key: string; day: { busy: Span[]; join: string[]; holiday: boolean } | null } | null>(null);
  const ref = target.type === "lesson" ? { schoolLessonId: target.schoolLessonId } : { euTopicId: target.euTopicId };
  const key = `${instructorId}|${date}`;
  const day = fetched?.key === key ? fetched.day : null;

  useEffect(() => {
    let live = true;
    if (instructorId && date) boardDay(instructorId, date, ref).then((d) => live && setFetched({ key: `${instructorId}|${date}`, day: d }));
    return () => {
      live = false;
    };
    // ref følger lektionen, som ikke skifter, mens boksen er åben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructorId, date]);

  // Ledige starttider i skolens lektionsplan; har læreren samme lektion på tiden, kan eleven sættes på.
  const options = ctx.plan.starts.map((t) => {
    const join = !!day?.join.includes(t);
    const free = !!day && !day.holiday && planSlotIsFree(ctx.plan, t, target.count, day.busy);
    return { t, join, ok: join || free };
  });
  const done = state && !("error" in state);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="label" value={target.label} />
      {target.type === "lesson" ? (
        <input type="hidden" name="schoolLessonId" value={target.schoolLessonId} />
      ) : (
        <input type="hidden" name="euTopicId" value={target.euTopicId} />
      )}
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Underviser
        <select name="instructorId" value={instructorId} onChange={(e) => (setInstructorId(e.target.value), setStart(""))} required className={inputClass}>
          <option value="">Vælg underviser</option>
          {ctx.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Dato
        <input type="date" name="date" min={ctx.today} value={date} onChange={(e) => (setDate(e.target.value), setStart(""))} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Starttidspunkt
        <select name="start" value={start} onChange={(e) => setStart(e.target.value)} required disabled={!day} className={inputClass}>
          <option value="">{!instructorId ? "Vælg først underviser" : !day ? "Henter …" : day.holiday ? "Underviseren har ferie" : "Vælg tid"}</option>
          {day &&
            options.map((o) => (
              <option key={o.t} value={o.t} disabled={!o.ok}>
                {o.t}
                {o.join ? " – sæt eleven på" : !o.ok ? " (optaget)" : ""}
              </option>
            ))}
        </select>
      </label>
      <p className="text-[13px] text-muted">
        {target.count} {target.count === 1 ? "lektion" : "lektioner"} á {ctx.plan.minutes} min.
        {date ? ` · ${formatDate(date)}` : ""}. Kommer i underviserens og elevens kalender; timerne registreres som altid.
      </p>
      <ResultBox state={state} />
      <div className="flex gap-2">
        {!done && (
          <button type="submit" disabled={pending || !start} className={primary}>
            {pending ? "Gemmer …" : "Planlæg"}
          </button>
        )}
        <button type="button" onClick={onClose} className={plain}>
          {done ? "Luk" : "Annuller"}
        </button>
      </div>
    </form>
  );
}

function AppointmentForm({ studentId, kind, today, onClose }: { studentId: string; kind: string; today: string; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(addAppointment);
  const done = state && !("error" in state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Dato
        <input type="date" name="date" min={today} defaultValue={today} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Klokkeslæt (valgfri)
        <input type="time" name="time" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Adresse (valgfri)
        <input name="address" maxLength={200} className={inputClass} />
      </label>
      <ResultBox state={state} />
      <div className="flex gap-2">
        {!done && (
          <button type="submit" disabled={pending} className={primary}>
            {pending ? "Gemmer …" : "Gem aftale"}
          </button>
        )}
        <button type="button" onClick={onClose} className={plain}>
          {done ? "Luk" : "Annuller"}
        </button>
      </div>
    </form>
  );
}

// Allerede planlagt: hvem og hvornår, og "Aflys" (fx læreren er syg). Bagefter kan der planlægges en ny tid.
function CancelForm({ studentId, planned, onClose }: { studentId: string; planned: { id: string; date: string; start: string; instructor: string }; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(cancelBoardPlan, "Aflys den planlagte lektion?");
  const done = state && !("error" in state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="plan-cancel">
      <input type="hidden" name="lessonId" value={planned.id} />
      <input type="hidden" name="studentId" value={studentId} />
      <p className="rounded-xl border border-warn-line bg-warn-bg px-3.5 py-2.5">
        <b>Planlagt {formatLongDate(planned.date)} kl. {planned.start}</b>
        {planned.instructor && <span className="block text-[14px]">Underviser: {planned.instructor}</span>}
      </p>
      <p className="text-[13px] text-muted">Skal den flyttes, så aflys den og planlæg en ny tid, eller ret den i kalenderen.</p>
      <ResultBox state={state} />
      <div className="flex gap-2">
        {!done && (
          <button type="submit" disabled={pending} className="h-11 rounded-xl border border-bad/40 bg-surface px-4 text-[15px] font-bold text-bad disabled:opacity-60">
            {pending ? "Aflyser …" : "Aflys lektionen"}
          </button>
        )}
        <button type="button" onClick={onClose} className={plain}>
          Luk
        </button>
      </div>
    </form>
  );
}
