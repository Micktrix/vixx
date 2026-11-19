// Fremskridt i et modulforløb (trin E8): hvor mange lektioner eleven har fået i hvert modul, sammenlignet med
// modulets minimum. Bruges på lærerens scanning, i elevens app og hos kontoret.

export type PlanModule = { id: string; number: number; name: string; min_theory: number; min_driving: number; min_dark: number };
export type ModuleCount = { course_module_id: string; kind: "driving" | "theory"; lesson_count: number; dark: boolean; lesson_date: string };

export type ModuleProgress = PlanModule & {
  theory: number;
  driving: number;
  dark: number;
  startedOn: string | null; // dato for første tælling i modulet = opstart
  reached: boolean; // minimum for teori, kørsel og mørke er nået
};

export function moduleProgress(modules: PlanModule[], counts: ModuleCount[]): ModuleProgress[] {
  return [...modules]
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const own = counts.filter((c) => c.course_module_id === m.id);
      const sum = (f: (c: ModuleCount) => boolean) => own.filter(f).reduce((n, c) => n + c.lesson_count, 0);
      const theory = sum((c) => c.kind === "theory");
      const driving = sum((c) => c.kind === "driving");
      const dark = sum((c) => c.kind === "driving" && c.dark);
      const startedOn = own.map((c) => c.lesson_date).sort()[0] ?? null;
      return { ...m, theory, driving, dark, startedOn, reached: theory >= m.min_theory && driving >= m.min_driving && dark >= m.min_dark };
    });
}

// Vixx foreslår første modul, hvor minimum ikke er nået (indtil "Afslut modul" er bygget). Alle nået → sidste.
export function suggestedModule(progress: ModuleProgress[]): ModuleProgress | undefined {
  return progress.find((m) => !m.reached) ?? progress[progress.length - 1];
}

// Fx "Teori 7 af 7 · Kørsel 2 af 3" (mørke kun, når modulet har mørke).
export function progressText(m: ModuleProgress): string {
  const parts = [`Teori ${m.theory} af ${m.min_theory}`];
  if (m.min_driving > 0 || m.driving > 0) parts.push(`Kørsel ${m.driving} af ${m.min_driving}`);
  if (m.min_dark > 0) parts.push(`heraf i mørke ${m.dark} af ${m.min_dark}`);
  return parts.join(" · ");
}
