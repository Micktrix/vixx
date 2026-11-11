"use client";

import { useState } from "react";
import { TextField } from "@/components/form";

// "Flere dage": samme tidsrum hver dag fra datoen til og med slutdatoen.
export function MultiDayFields({ date }: { date: string }) {
  const [multi, setMulti] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" name="multiDay" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="size-[18px] accent-accent" />
        Flere dage
      </label>
      {multi && (
        <div className="grid gap-3 rounded-xl border border-line bg-bg p-3 sm:grid-cols-2">
          <TextField
            label="Til og med"
            name="endDate"
            type="date"
            required
            min={date}
            defaultValue={date}
            hint="Samme tidsrum hver dag. Højst 60 dage."
          />
          <label className="flex items-center gap-2.5 self-center text-[15px]">
            <input type="checkbox" name="weekdaysOnly" defaultChecked className="size-[18px] accent-accent" />
            Kun hverdage (man–fre)
          </label>
        </div>
      )}
    </div>
  );
}
