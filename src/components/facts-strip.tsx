import { factText, facts, KIND_LABEL, type Appointment, type AppointmentKind } from "@/lib/appointments";
import { formatDate } from "@/lib/dates";
import type { ModuleProgress } from "@/lib/module-progress";

export const FACT_TONE = {
  none: "border-line bg-soft text-muted",
  booked: "border-warn-line bg-warn-bg text-warn",
  done: "border-ok/30 bg-ok-bg text-ok",
  failed: "border-bad/30 bg-bad-bg text-bad",
} as const;

// Faktaboksen kun til visning: KTA, Mørke, Teoriprøve og Køreprøve (grå/gul/grøn) med aftalernes dato, tid og
// adresse. Bruges i elevens app og ved lærerens scanning.
export function FactsStrip({
  modules,
  appointments,
  title,
  extra = [],
}: {
  modules: ModuleProgress[];
  appointments: Appointment[];
  title?: string;
  extra?: AppointmentKind[]; // EU-prøverne
}) {
  return (
    <section className="flex flex-col gap-2" data-testid="facts-strip">
      {title && <h2 className="text-[17px] font-bold">{title}</h2>}
      <div className="grid grid-cols-2 gap-2">
        {facts(modules, appointments, extra).map((f) => (
          <div key={f.kind} className={`rounded-[14px] border px-3 py-2 ${FACT_TONE[f.tone]}`} data-testid={`fact-${f.kind}`} data-tone={f.tone}>
            <b className="block text-[15px] text-ink">{KIND_LABEL[f.kind]}</b>
            <span className="block text-[13px]">{factText(f, formatDate)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
