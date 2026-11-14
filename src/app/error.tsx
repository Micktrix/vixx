"use client";

import Link from "next/link";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { ErrorCard } from "@/components/error-card";

const RELOADED = "vixx-reloaded-after-update";

// Uventet fejl på en side. Fejlen står i Vercels log; referencen hjælper med at finde den.
// Er Vixx blevet opdateret, mens siden var åben, kender serveren ikke længere sidens handlinger. Så
// indlæses siden igen af sig selv (højst én gang inden for et minut, så den aldrig kører i ring).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const updated = Boolean(unstable_isUnrecognizedActionError(error));

  useEffect(() => {
    if (!updated) {
      console.error(error);
      return;
    }
    try {
      const last = Number(sessionStorage.getItem(RELOADED) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      // Uden sessionStorage genindlæses alligevel; brugeren kan altid trykke "Prøv igen".
    }
    window.location.reload();
  }, [error, updated]);

  if (updated) {
    return (
      <ErrorCard title="Vixx er lige blevet opdateret">
        <p className="text-muted">Siden indlæses igen. Prøv derefter det, du var i gang med, en gang til.</p>
        <div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
          >
            Indlæs siden igen
          </button>
        </div>
      </ErrorCard>
    );
  }

  return (
    <ErrorCard title="Noget gik galt">
      <p className="text-muted">Siden kunne ikke vises. Prøv igen om lidt. Sker det igen, så kontakt kontoret.</p>
      {error.digest && <p className="text-[13px] text-muted">Reference: {error.digest}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
        >
          Prøv igen
        </button>
        <Link href="/" className="font-semibold text-accent-ink underline underline-offset-[3px]">
          Gå til forsiden
        </Link>
      </div>
    </ErrorCard>
  );
}
