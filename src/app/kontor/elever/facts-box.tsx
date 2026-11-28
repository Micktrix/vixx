import { FACT_TONE } from "@/components/facts-strip";
import { ActionForm, TextField } from "@/components/form";
import { appointmentText, factText, isTest, KIND_LABEL, type Fact } from "@/lib/appointments";
import { formatDate } from "@/lib/dates";
import { addAppointment, deleteAppointment, markFactDone, setAppointmentStatus } from "./actions";

// Faktaboksen på eleven (21. nov. 2026): KTA, Mørke, Teoriprøve og Køreprøve i farver, med aftalerne.
// Lærere og kontor skriver aftaler ind; bestået/ikke bestået gemmes som historik.
export function FactsBox({ studentId, facts, canFinish }: { studentId: string; facts: Fact[]; canFinish: boolean }) {
  const drivingPassed = facts.find((f) => f.kind === "driving_test")?.current?.status === "passed";
  return (
    <section className="flex flex-col gap-3" data-testid="facts">
      <div className="grid grid-cols-2 items-start gap-2 min-[860px]:grid-cols-4">
        {facts.map((f) => (
          <FactCard key={f.kind} studentId={studentId} fact={f} />
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

      <p className="text-[13px] text-muted">Tryk på en blok for at booke, eller for at sætte bestået/ikke bestået.</p>
    </section>
  );
}

// En blok i faktaboksen. Tryk på den for at booke (grå eller rød = ikke bestået; "+ Ny aftale" er væk, Michael
// 28. nov. 2026) eller ændre status: bestået/gennemført, ikke bestået, slet, eller (KTA og mørke) markér gennemført.
// Historikken står i blokken.
function FactCard({ studentId, fact: f }: { studentId: string; fact: Fact }) {
  const booked = f.current?.status === "booked" ? f.current : null;
  const past = f.history.filter((a) => a.id !== booked?.id);
  const manual = !isTest(f.kind) && f.tone !== "done" && !booked;
  const label = KIND_LABEL[f.kind];
  return (
    <details className={`rounded-xl border px-3 py-2 ${FACT_TONE[f.tone]}`} data-testid={`fact-${f.kind}`} data-tone={f.tone}>
      <summary className="cursor-pointer list-none">
        <b className="block text-[15px] text-ink">{label}</b>
        <span className="block text-[13px]">{factText(f, formatDate)}</span>
      </summary>
      <div className="mt-2 flex flex-col items-start gap-2 border-t border-current/15 pt-2 text-[13px] text-ink">
        {booked && (
          <>
            <StatusButton id={booked.id} status="passed" label={isTest(f.kind) ? "Bestået" : "Gennemført"} />
            {isTest(f.kind) && <StatusButton id={booked.id} status="failed" label="Ikke bestået" />}
            <ActionForm action={deleteAppointment} submitLabel="Slet aftalen" pendingLabel="…" primary={false} confirmText={`Slet aftalen om ${label.toLowerCase()}?`}>
              <input type="hidden" name="id" value={booked.id} />
            </ActionForm>
          </>
        )}
        {manual && (
          <ActionForm action={markFactDone} submitLabel="Markér gennemført" pendingLabel="…" primary={false} confirmText={`Markér ${label.toLowerCase()} som gennemført?`}>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="kind" value={f.kind} />
          </ActionForm>
        )}
        {!booked && f.tone !== "done" && (
          <ActionForm action={addAppointment} submitLabel={f.tone === "failed" ? "Book ny prøve" : "Book"} className="flex w-full flex-col gap-2">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="kind" value={f.kind} />
            <TextField label="Dato" name="date" type="date" required />
            <TextField label="Klokkeslæt" name="time" type="time" />
            <TextField label="Adresse (valgfri)" name="address" maxLength={200} />
          </ActionForm>
        )}
        {past.length > 0 && (
          <ul className="text-muted">
            {past.map((a) => (
              <li key={a.id}>
                {a.status === "passed" ? (isTest(f.kind) ? "Bestået" : "Gennemført") : a.status === "failed" ? "Ikke bestået" : "Booket"}{" "}
                {appointmentText(a, formatDate)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
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
