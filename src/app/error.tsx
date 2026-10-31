"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorCard } from "@/components/error-card";

// Uventet fejl på en side. Fejlen står i Vercels log; referencen hjælper med at finde den.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
