import { inputClass } from "@/components/styles";
import { TIME_SLOTS } from "@/lib/schedule";

// Klokkeslæt i kvarterer (05:00–22:00) til aftaler som teoriprøve, mørke og køreprøve. Telefonens ur med alle minutter
// var uoverskueligt (Michael 28. nov. 2026).
export function QuarterTime({ label = "Klokkeslæt (valgfri)", name = "time" }: { label?: string; name?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-bold">
      {label}
      <select name={name} defaultValue="" className={inputClass}>
        <option value="">Intet klokkeslæt</option>
        {TIME_SLOTS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
