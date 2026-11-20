"use client";

import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import type { ModuleProgress } from "@/lib/module-progress";
import { completeModule } from "./actions";

const check = "size-[20px] shrink-0 accent-accent";

// Afslut elevens aktuelle modul: erklæring, evt. selvstudie og "Overført fra lektionsplan". Vixx gemmer dato og
// lærer og regner ekstra lektioner ud. Afslutningen kan ikke fortrydes.
export function CompleteForm({ token, studentId, module: m }: { token: string; studentId: string; module: ModuleProgress }) {
  const { state, onSubmit, pending } = useFormAction(completeModule);
  const extraTheory = Math.max(m.theory - m.min_theory, 0);
  const extraDriving = Math.max(m.driving - m.min_driving, 0);

  // Klar (minimum nået og alle lektioner kørt): Vixx spørger selv. Ellers kun et lille link til overførte elever.
  const fields = (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="moduleId" value={m.id} />
      {m.reached ? (
        <p className="text-sm">
          Minimum er nået. Ekstra lektioner: {extraTheory} teori og {extraDriving} kørsel.
        </p>
      ) : (
        <p className="text-sm text-bad">Minimum er ikke nået. Modulet kan kun afsluttes, hvis eleven er overført fra lektionsplanen.</p>
      )}
      {!m.lessonsDone && (
        <p className="text-sm text-bad">
          Ikke alle modulets lektioner er kørt:{" "}
          {m.lessons
            .filter((l) => !l.doneOn)
            .map((l) => `lektion ${l.lesson.number}`)
            .join(", ")}
          .
        </p>
      )}
      {m.notDriven.length > 0 && (
        <p className="text-sm text-bad" data-testid="complete-not-driven">
          Ikke kørt: {m.notDriven.map((n) => (n.lesson ? `${n.item} (lektion ${n.lesson})` : n.item)).join(" · ")}. Du kan afslutte alligevel.
        </p>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Selvstudie <span className="font-normal text-muted">(valgfrit: antal lektioner og afsnit)</span>
        <input name="selfStudy" maxLength={500} className={inputClass} />
      </label>
      <label className="flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" name="transferred" defaultChecked={!m.ready} className={check} />
        Overført fra lektionsplan
      </label>
      <label className="flex items-start gap-2.5 text-[15px]">
        <input type="checkbox" name="declaration" required className={`${check} mt-0.5`} />
        Jeg erklærer, at eleven har opnået de nødvendige kompetencer og opfylder målene i undervisningsplanen for modulet.
      </label>
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? "Afslutter …" : `Afslut modul ${m.number}`}
      </button>
      <p className="text-[13px] text-muted">Dato og dit navn gemmes. Afslutningen kan ikke fortrydes.</p>
      <ResultBox state={state} />
    </form>
  );

  if (m.ready) {
    return (
      <section className="rounded-[20px] border border-ok/30 bg-ok-bg p-4" data-testid="complete-module">
        <b className="text-[17px]">Vil du afslutte modul {m.number}?</b>
        <p className="text-sm">Alle lektioner er kørt, og minimum er nået.</p>
        {fields}
      </section>
    );
  }
  return (
    <details className="rounded-[16px] px-1 text-sm" data-testid="complete-module-transferred">
      <summary className="cursor-pointer font-semibold text-muted">Er eleven overført fra lektionsplanen?</summary>
      <p className="mt-2 text-[13px] text-muted">Så kan modul {m.number} afsluttes, selv om minimum ikke er talt i Vixx.</p>
      {fields}
    </details>
  );
}
