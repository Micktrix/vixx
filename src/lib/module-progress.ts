// Fremskridt i et modulforløb (Færdselsstyrelsens modulplan): kørsel (og teori, når den scannes) i hvert modul
// sammenlignet med minimum, modulets køreemner (afsnit 2, 7 og 9), mørke (emnet 7.19) og afslutningen.
// Bruges på lærerens scanning, i elevens app og hos kontoret.

export type PlanModule = {
  id: string;
  number: number;
  name: string;
  min_theory: number;
  min_driving: number;
  min_dark: number; // > 0 = modulet har krav om kørsel i mørke (7.19)
  topics?: string | null; // modulets emner (afsnittene fra modulplanen), ét pr. linje
};
export type ModuleCount = {
  course_module_id: string;
  kind: "driving" | "theory";
  lesson_count: number;
  dark: boolean; // 7.19 bekræftet i denne kørsel
  lesson_date: string;
  skipped_items?: string | null; // køreemner, der ikke blev kørt (ét pr. linje)
};
export type ModuleCompletion = {
  id: string;
  course_module_id: string;
  module_number: number;
  completed_on: string;
  started_on?: string | null;
  instructor_id: string | null; // null = gæstelærer uden app, registreret af admin
  instructor_name: string;
  comment: string | null;
  annulled_at: string | null; // annulleret af admin; tæller ikke
  annul_reason: string | null;
  transferred: boolean;
  self_study: string | null;
  theory_lessons?: number | null;
  extra_theory: number;
  extra_driving: number;
};

export type ModuleProgress = PlanModule & {
  theory: number; // talt ved scanning (kun når teori registreres ved scanning)
  driving: number;
  darkDone: boolean; // 7.19 er bekræftet i modulet
  ktaTopic: string | null; // modulets KTA-emne (afsnit 9), hvis modulet har det
  ktaDone: boolean; // KTA er bekræftet ved scanning eller markeret gennemført
  startedOn: string | null; // første kørsel (eller teori) i modulet
  reached: boolean; // kørsel (og teori, når den scannes) har nået minimum, og mørke-kravet er opfyldt
  completed: ModuleCompletion | null;
  drivingTopics: string[]; // modulets køreemner
  drivenTopics: string[]; // køreemner, der er kørt i mindst én lektion
  notDriven: string[]; // køreemner, der ikke er kørt endnu (kun når der er kørt i modulet)
};

export const lessonItems = (content: string | null | undefined) =>
  (content ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

// Køreemnerne er afsnit 2, 7 og 9 (underafsnit som "7.4 …" eller hele afsnit som "Afsnit 9 – …"). Overskrifter
// med "(uddrag)" og teoriafsnittene (1, 3–6, 8 og 10) er ikke med.
export const isDrivingTopic = (line: string) => /^[279]\.\d/.test(line) || /^Afsnit [279] [–-]/.test(line);
export const drivingTopics = (topics: string | null | undefined) => lessonItems(topics).filter(isDrivingTopic);
export const isDarkTopic = (line: string) => line.startsWith("7.19");
// KTA = afsnit 9 (manøvrer på køreteknisk anlæg), i sidste modul. Skal bekræftes som mørke (Michael 21. nov. 2026).
export const isKtaTopic = (line: string) => /^9\.\d/.test(line) || /^Afsnit 9 [–-]/.test(line);

export function moduleProgress(
  modules: PlanModule[],
  counts: ModuleCount[],
  completions: ModuleCompletion[] = [],
  theoryAtScan = true,
  ktaPassed = false, // KTA markeret gennemført i faktaboksen
): ModuleProgress[] {
  return [...modules]
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const own = counts.filter((c) => c.course_module_id === m.id);
      const sum = (f: (c: ModuleCount) => boolean) => own.filter(f).reduce((n, c) => n + c.lesson_count, 0);
      const theory = sum((c) => c.kind === "theory");
      const driving = sum((c) => c.kind === "driving");
      const drives = own.filter((c) => c.kind === "driving");
      const darkDone = drives.some((c) => c.dark);
      const startedOn = own.map((c) => c.lesson_date).sort()[0] ?? null;
      const completed = completions.find((c) => c.course_module_id === m.id && !c.annulled_at) ?? null;
      const topics = drivingTopics(m.topics);
      const ktaTopic = topics.find(isKtaTopic) ?? null;
      const ktaDone = !!ktaTopic && (ktaPassed || drives.some((c) => !lessonItems(c.skipped_items).includes(ktaTopic)));
      const reached =
        driving >= m.min_driving && (m.min_dark === 0 || darkDone) && (!ktaTopic || ktaDone) && (!theoryAtScan || theory >= m.min_theory);
      // Et emne er kørt, så snart det havde flueben i én kørsel. 7.19 er kørt, når mørke er bekræftet.
      const driven = (item: string) =>
        isDarkTopic(item) && m.min_dark > 0 ? darkDone : drives.some((c) => !lessonItems(c.skipped_items).includes(item));
      const drivenTopics = topics.filter(driven);
      const notDriven = drives.length ? topics.filter((t) => !driven(t)) : [];
      return { ...m, theory, driving, darkDone, ktaTopic, ktaDone, startedOn, reached, completed, drivingTopics: topics, drivenTopics, notDriven };
    });
}

// Elevens aktuelle modul: første modul, der ikke er afsluttet (modulerne afsluttes i rækkefølge).
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

// Fx "Kørsel 2 af 3 · Teori 4 af 7 · Mangler mørke (7.19)". Teori kun, når den scannes.
export function progressText(m: ModuleProgress, theoryAtScan = true): string {
  const parts: string[] = [];
  if (m.min_driving > 0 || m.driving > 0) parts.push(`Kørsel ${m.driving} af ${m.min_driving}`);
  if (theoryAtScan) parts.push(`Teori ${m.theory} af ${m.min_theory}`);
  else parts.push(`Teori min. ${m.min_theory} (bekræftes ved afslutning)`);
  if (m.min_dark > 0) parts.push(m.darkDone ? "Mørke kørt" : "Mangler mørke (7.19)");
  if (m.ktaTopic) parts.push(m.ktaDone ? "KTA kørt" : "Mangler KTA (afsnit 9)");
  return parts.join(" · ");
}

// Minimum undervisningsdage (B 14, C og D 12, C/E 10). Når teori scannes: antal forskellige scanningsdage.
// Ellers hverdage (mandag–fredag) fra start af modul 1 til og med i dag.
export function teachingDays(opts: { theoryAtScan: boolean; courseStart: string | null; scanDates: string[]; today: string }): number {
  if (opts.theoryAtScan) return new Set(opts.scanDates).size;
  if (!opts.courseStart) return 0;
  let n = 0;
  const d = new Date(`${opts.courseStart}T12:00:00Z`);
  const end = new Date(`${opts.today}T12:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

// "1 kørselslektion" / "4 kørselslektioner".
export const lessonsWord = (n: number, kind: "driving" | "theory") =>
  `${n} ${kind === "driving" ? "kørselslektion" : "teorilektion"}${n === 1 ? "" : "er"}`;
