"use client";

import { useState } from "react";
import { TextField } from "@/components/form";

// Sats (kr. pr. lektion) og "gælder fra". En dato bagud er tilladt, men ændrer ikke-godkendte lektioner, så vi advarer.
export function PriceFields({ today, priceLabel = "Sats pr. lektion (kr.)" }: { today: string; priceLabel?: string }) {
  const [validFrom, setValidFrom] = useState(today);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={priceLabel} name="price" inputMode="decimal" required placeholder="Fx 260" />
        <TextField
          label="Gælder fra"
          name="validFrom"
          type="date"
          required
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
        />
      </div>
      {validFrom && validFrom < today && (
        <p role="note" className="rounded-xl border border-accent-line bg-accent-bg px-3.5 py-2.5 text-sm">
          Datoen ligger bagud. Satsen gælder også for lektioner fra datoen, der endnu ikke er godkendt. Godkendte
          lektioner beholder deres sats.
        </p>
      )}
    </div>
  );
}
