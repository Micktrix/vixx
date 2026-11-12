import { inputClass } from "@/components/styles";
import type { CourseInfo, TeamInfo } from "./data";

type Option = { id: string; name: string };

// Forløb, hold og ydelse for en elev. Ydelsen bruges til lønnen, når læreren kvitterer for en kørselslektion.
export function StudentFields({
  courses,
  teams,
  services,
  value,
}: {
  courses: CourseInfo[];
  teams: TeamInfo[];
  services: Option[];
  value?: { courseId?: string; teamId?: string | null; serviceId?: string | null };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Forløb
        <select name="courseId" required defaultValue={value?.courseId ?? ""} className={inputClass}>
          <option value="" disabled>
            Vælg forløb
          </option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Hold (valgfri)
        <select name="teamId" defaultValue={value?.teamId ?? ""} className={inputClass}>
          <option value="">Intet hold</option>
          {teams
            .filter((t) => t.active || t.id === value?.teamId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Ydelse til lønnen (valgfri)
        <select name="serviceId" defaultValue={value?.serviceId ?? ""} className={inputClass}>
          <option value="">Vælges ved kvittering</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
