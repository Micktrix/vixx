import type { ModuleProgress } from "./module-progress";

// Skolens lektionsplan (trin E10): C, D og C/E. Læreren vælger lektionen; Vixx fordeler lektionens 45-minutters-enheder
// på modulerne (`units`) og afslutter modulet, når den sidste manglende lektion køres.

export type SchoolLesson = {
  id: string;
  number: number;
  title: string;
  kind: "normal" | "dark" | "kta";
  units: number[]; // modulnummer pr. 45 min.
  items: string;
  control: string | null;
  note: string | null;
};
export type LessonSignoff = { id?: string; school_lesson_id: string; lesson_date: string; instructor_name: string; skipped?: string | null };

export const LESSON_FIELDS = "id, number, title, kind, units, items, control, note";
export const LESSON_SIGNOFF_FIELDS = "id, school_lesson_id, lesson_date, instructor_name, skipped";

export const lessonLines = (items: string) =>
  items
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
// Et punkt med en kode ("7.9 Overhaling") kan krydses af; overskrifter og intervaller ("1.1–1.7 …") er kun tekst.
export const isCheckable = (line: string) => /^(\d+\.\d+|Afsnit \d+)\s/.test(line);
export const lengthText = (l: Pick<SchoolLesson, "units">) => `${l.units.length} × 45 min.`;
// "Lektion 6 (mørke)", "KTA (køreteknisk anlæg)".
export const lessonLabel = (l: Pick<SchoolLesson, "title" | "kind">) =>
  l.kind === "dark" ? `${l.title} (mørke)` : l.kind === "kta" ? `${l.title} (køreteknisk anlæg)` : l.title;

export function lessonProgress(lessons: SchoolLesson[], signoffs: LessonSignoff[]) {
  const list = [...lessons]
    .sort((a, b) => a.number - b.number)
    .map((l) => ({ ...l, done: signoffs.find((s) => s.school_lesson_id === l.id) ?? null }));
  const total = list.reduce((n, l) => n + l.units.length, 0);
  const done = list.filter((l) => l.done).reduce((n, l) => n + l.units.length, 0);
  return { lessons: list, doneCount: list.filter((l) => l.done).length, share: total ? done / total : 0 };
}

// Hvilke moduler afsluttes, hvis de valgte lektioner bekræftes? Modulerne afsluttes i rækkefølge, når kørslen når
// minimum, og mørke og KTA er kørt (eller bekræftes nu).
export function modulesToComplete(
  modules: ModuleProgress[],
  chosen: SchoolLesson[],
  opts: { dark: boolean; kta: boolean; theoryAtScan: boolean },
): ModuleProgress[] {
  const out: ModuleProgress[] = [];
  for (const m of [...modules].sort((a, b) => a.number - b.number)) {
    if (m.completed) continue;
    const add = chosen.reduce((n, l) => n + l.units.filter((u) => u === m.number).length, 0);
    const darkNow = opts.dark && chosen.some((l) => l.kind === "dark" && l.units.includes(m.number));
    const ktaNow = opts.kta && chosen.some((l) => l.kind === "kta" && l.units.includes(m.number));
    const ok =
      m.driving + add >= m.min_driving &&
      (m.min_dark === 0 || m.darkDone || darkNow) &&
      (!m.ktaTopic || m.ktaDone || ktaNow) &&
      (!opts.theoryAtScan || m.theory >= m.min_theory);
    if (!ok) break;
    out.push(m);
  }
  return out;
}
