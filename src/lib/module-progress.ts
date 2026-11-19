// Fremskridt i et modulforløb (trin E8): hvor mange lektioner eleven har fået i hvert modul, sammenlignet med
// modulets minimum. Bruges på lærerens scanning, i elevens app og hos kontoret.

export type PlanModule = { id: string; number: number; name: string; min_theory: number; min_driving: number; min_dark: number };
export type ModuleCount = { course_module_id: string; kind: "driving" | "theory"; lesson_count: number; dark: boolean; lesson_date: string };
export type ModuleCompletion = {
  id: string;
  course_module_id: string;
  module_number: number;
  completed_on: string;
  instructor_id: string | null; // null = gæstelærer uden app, registreret af admin
  instructor_name: string;
  comment: string | null;
  annulled_at: string | null; // annulleret af admin; tæller ikke
  annul_reason: string | null;
  transferred: boolean;
  self_study: string | null;
  extra_theory: number;
  extra_driving: number;
};

export type ModuleProgress = PlanModule & {
  theory: number;
  driving: number;
  dark: number;
  startedOn: string | null; // dato for første tælling i modulet = opstart
  reached: boolean; // minimum for teori, kørsel og mørke er nået
  completed: ModuleCompletion | null; // læreren har afsluttet modulet
};

export function moduleProgress(modules: PlanModule[], counts: ModuleCount[], completions: ModuleCompletion[] = []): ModuleProgress[] {
  return [...modules]
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const own = counts.filter((c) => c.course_module_id === m.id);
      const sum = (f: (c: ModuleCount) => boolean) => own.filter(f).reduce((n, c) => n + c.lesson_count, 0);
      const theory = sum((c) => c.kind === "theory");
      const driving = sum((c) => c.kind === "driving");
      const dark = sum((c) => c.kind === "driving" && c.dark);
      const startedOn = own.map((c) => c.lesson_date).sort()[0] ?? null;
      const reached = theory >= m.min_theory && driving >= m.min_driving && dark >= m.min_dark;
      const completed = completions.find((c) => c.course_module_id === m.id && !c.annulled_at) ?? null;
      return { ...m, theory, driving, dark, startedOn, reached, completed };
    });
}

// Elevens aktuelle modul: første modul, der ikke er afsluttet (modulerne afsluttes i rækkefølge).
// Undefined, når alle moduler er afsluttet.
export function suggestedModule(progress: ModuleProgress[]): ModuleProgress | undefined {
  return progress.find((m) => !m.completed);
}

// Fx "Afsluttet 19. nov. 2026 · Lars Jensen · 2 ekstra kørsel".
export function completionText(c: ModuleCompletion, formatDate: (iso: string) => string): string {
  const parts = [`Afsluttet ${formatDate(c.completed_on)}`, c.instructor_id ? c.instructor_name : `${c.instructor_name} (gæstelærer)`];
  if (c.extra_theory) parts.push(`${c.extra_theory} ekstra teori`);
  if (c.extra_driving) parts.push(`${c.extra_driving} ekstra kørsel`);
  if (c.transferred) parts.push("overført fra lektionsplan");
  return parts.filter(Boolean).join(" · ");
}

// Fx "Teori 7 af 7 · Kørsel 2 af 3" (mørke kun, når modulet har mørke).
export function progressText(m: ModuleProgress): string {
  const parts = [`Teori ${m.theory} af ${m.min_theory}`];
  if (m.min_driving > 0 || m.driving > 0) parts.push(`Kørsel ${m.driving} af ${m.min_driving}`);
  if (m.min_dark > 0) parts.push(`heraf i mørke ${m.dark} af ${m.min_dark}`);
  return parts.join(" · ");
}
