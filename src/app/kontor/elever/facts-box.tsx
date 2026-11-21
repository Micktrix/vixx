import { FACT_TONE } from "@/components/facts-strip";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { appointmentText, factText, isTest, KIND_LABEL, type Fact } from "@/lib/appointments";
import { formatDate, todayDk } from "@/lib/dates";
import { addAppointment, deleteAppointment, markFactDone, setAppointmentStatus } from "./actions";


// Faktaboksen på eleven (21. nov. 2026): KTA, Mørke, Teoriprøve og Køreprøve i farver, med aftalerne.
// Lærere og kontor skriver aftaler ind; bestået/ikke bestået gemmes som historik.
export function FactsBox({ studentId, facts, canFinish }: { studentId: string; facts: Fact[]; canFinish: boolean }) {
  const drivingPassed = facts.find((f) => f.kind === "driving_test")?.current?.status === "passed";
  return (
    <section className="flex flex-col gap-3" data-testid="facts">
      <div className="grid grid-cols-2 gap-2 min-[860px]:grid-cols-4">
        {facts.map((f) => (
          <div key={f.kind} className={`rounded-xl border px-3 py-2 ${FACT_TONE[f.tone]}`} data-testid={`fact-${f.kind}`} data-tone={f.tone}>
            <b className="block text-[15px] text-ink">{KIND_LABEL[f.kind]}</b>
            <span className="block text-[13px]">{factText(f, formatDate)}</span>
          </div>
        ))}
      </div>

      {drivingPassed && canFinish && (
        <p className="rounded-xl border border-ok/30 bg-ok-bg px-3 py-2 text-sm">
          Køreprøven er bestået.{" "}
          <a href="#afslut-forloeb" className="font-bold underline">
            Afslut forløb (bestået køreprøve)?
          </a>
        </p>
      )}

      {facts.map((f) => (
        <FactActions key={f.kind} studentId={studentId} fact={f} />
      ))}

      <details className="text-sm" data-testid="new-appointment">
        <summary className="cursor-pointer font-semibold text-muted hover:text-ink">+ Ny aftale</summary>
        <ActionForm action={addAppointment} submitLabel="Gem aftale" className="mt-2 flex flex-wrap items-end gap-3">
          <input type="hidden" name="studentId" value={studentId} />
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Aftale
            <select name="kind" defaultValue="theory_test" className={`${inputClass} w-[170px]`}>
              {facts.map((f) => (
                <option key={f.kind} value={f.kind}>
                  {KIND_LABEL[f.kind]}
                </option>
              ))}
            </select>
          </label>
          <TextField label="Dato" name="date" type="date" required />
          <TextField label="Klokkeslæt" name="time" type="time" />
          <TextField label="Adresse (valgfri)" name="address" maxLength={200} className="min-w-[220px] flex-1" />
        </ActionForm>
      </details>
    </section>
  );
}

// Den bookede aftale (bestået / ikke bestået / slet), manuel "gennemført" for KTA og mørke, og historikken.
function FactActions({ studentId, fact: f }: { studentId: string; fact: Fact }) {
  const booked = f.current?.status === "booked" ? f.current : null;
  const past = f.history.filter((a) => a.status !== "booked" || a.id !== booked?.id);
  const manual = !isTest(f.kind) && f.tone !== "done";
  if (!booked && !manual && !past.length) return null;
  const label = KIND_LABEL[f.kind];
  const today = todayDk();
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line px-3 py-2 text-sm" data-testid={`fact-actions-${f.kind}`}>
      <b>{label}</b>
      {booked && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Booket {appointmentText(booked, formatDate)}</span>
          {booked.on_date <= today && (
            <>
              <StatusButton id={booked.id} status="passed" label={isTest(f.kind) ? "Bestået" : "Gennemført"} />
              {isTest(f.kind) && <StatusButton id={booked.id} status="failed" label="Ikke bestået" />}
            </>
          )}
          <ActionForm
            action={deleteAppointment}
            submitLabel="Slet"
            pendingLabel="…"
            primary={false}
            confirmText={`Slet aftalen om ${label.toLowerCase()}?`}
          >
            <input type="hidden" name="id" value={booked.id} />
          </ActionForm>
        </div>
      )}
      {manual && !booked && (
        <ActionForm
          action={markFactDone}
          submitLabel="Markér gennemført"
          pendingLabel="…"
          primary={false}
          confirmText={`Markér ${label.toLowerCase()} som gennemført?`}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="kind" value={f.kind} />
          <span className="text-muted">Ikke scannet endnu. Er det kørt, så markér det her.</span>
        </ActionForm>
      )}
      {past.length > 0 && (
        <ul className="text-[13px] text-muted">
          {past.map((a) => (
            <li key={a.id}>
              {a.status === "passed" ? (isTest(f.kind) ? "Bestået" : "Gennemført") : a.status === "failed" ? "Ikke bestået" : "Booket"}{" "}
              {appointmentText(a, formatDate)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusButton({ id, status, label }: { id: string; status: "passed" | "failed"; label: string }) {
  return (
    <ActionForm action={setAppointmentStatus} submitLabel={label} pendingLabel="…" primary={status === "passed"} confirmText={`${label}? Det kan ikke ændres bagefter.`}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
    </ActionForm>
  );
}
