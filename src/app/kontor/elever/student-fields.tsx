import { inputClass } from "@/components/styles";
import { isEuKind, type CourseInfo, type TeamInfo } from "./data";

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
  value?: {
    courseId?: string;
    teamId?: string | null;
    serviceId?: string | null;
    address?: string | null;
    manualGear?: boolean;
    euCourseId?: string | null;
    courseStartOn?: string | null;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Forløb
        <select name="courseId" required defaultValue={value?.courseId ?? ""} className={inputClass}>
          <option value="" disabled>
            Vælg forløb
          </option>
          {courses
            .filter((c) => (c.active && !isEuKind(c.kind)) || c.id === value?.courseId)
            .map((c) => (
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
      <label className="flex flex-col gap-1.5 text-sm font-bold sm:col-span-3">
        Adresse <span className="font-normal text-muted">(står på modulplanen)</span>
        <input name="address" defaultValue={value?.address ?? ""} maxLength={200} placeholder="Vej 1, 8000 Aarhus C" className={inputClass} />
      </label>
      <label className="flex items-center gap-2.5 text-[15px] sm:col-span-3">
        <input type="checkbox" name="manualGear" defaultChecked={value?.manualGear ?? false} className="size-[18px] accent-accent" />
        Kode 78: forsøgsordningen med manuelt gear (kun B)
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        EU-forløb <span className="font-normal text-muted">(oven i kørekortet)</span>
        <select name="euCourseId" defaultValue={value?.euCourseId ?? ""} className={inputClass} data-testid="eu-course">
          <option value="">Intet EU</option>
          {courses
            .filter((c) => isEuKind(c.kind) && (c.active || c.id === value?.euCourseId))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Start af modul 1 <span className="font-normal text-muted">(tom = holdets startdato, ellers oprettelsesdatoen)</span>
        <input name="courseStartOn" type="date" defaultValue={value?.courseStartOn ?? ""} className={inputClass} />
      </label>
    </div>
  );
}
