"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form";
import { buttonClass, primaryButtonClass } from "@/components/styles";
import type { FormAction } from "@/lib/action-state";

// Kalender i telefonen: et abonnement på lærerens eller elevens egen kalenderfil. iPhone åbner webcal-linket direkte;
// til Google Kalender kopieres linket og tilføjes under "Fra webadresse".
export function CalendarBox({
  httpsUrl,
  intro,
  newLink,
}: {
  httpsUrl: string;
  intro: string;
  newLink?: FormAction;
}) {
  const [copied, setCopied] = useState(false);
  const webcal = httpsUrl.replace(/^https?:/, "webcal:");

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]"
      data-testid="calendar-box"
    >
      <h2 className="font-bold">Kalender i telefonen</h2>
      <p className="text-sm text-muted">{intro}</p>
      <a href={webcal} className={`${primaryButtonClass} justify-center`}>
        Føj til min kalender (iPhone)
      </a>
      <button
        type="button"
        onClick={copy}
        className={`${buttonClass} h-11 justify-center`}
      >
        {copied ? "Linket er kopieret" : "Kopiér link (Google Kalender)"}
      </button>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer font-semibold">
          Sådan gør du med Google Kalender
        </summary>
        <p className="mt-1.5">
          Kopiér linket. Åbn calendar.google.com på en computer, klik + ved
          &quot;Andre kalendere&quot;, vælg &quot;Fra webadresse&quot;, og
          indsæt linket. Google kan være op til et par timer om at vise
          ændringer.
        </p>
      </details>
      {newLink && (
        <ActionForm
          action={newLink}
          submitLabel="Lav nyt link"
          pendingLabel="…"
          primary={false}
          confirmText="Lav et nyt link? Det gamle holder op med at virke, og du skal tilføje kalenderen igen."
        >
          <p className="text-[13px] text-muted">
            Linket er personligt. Er en telefon blevet væk, så lav et nyt link.
          </p>
        </ActionForm>
      )}
    </section>
  );
}
