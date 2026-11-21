import { isKtaTopic, type ModuleProgress } from "./module-progress";

// Aftaler på eleven og faktaboksen (Michael, 21. nov. 2026): KTA, Mørke, Teoriprøve og Køreprøve.
// grå = intet gjort, gul = booket (der er en aftale), grøn = gennemført/bestået.
// KTA og Mørke bliver grønne af sig selv ved scanning (afsnit 9 kørt / 7.19 bekræftet) eller manuelt.

export const APPOINTMENT_KINDS = ["kta", "dark", "theory_test", "driving_test"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export type AppointmentStatus = "booked" | "passed" | "failed";
export type Appointment = {
  id: string;
  kind: AppointmentKind;
  on_date: string;
  at_time: string | null;
  address: string | null;
  status: AppointmentStatus;
  created_at: string;
};

export const KIND_LABEL: Record<AppointmentKind, string> = {
  kta: "KTA",
  dark: "Mørkekørsel",
  theory_test: "Teoriprøve",
  driving_test: "Køreprøve",
};
export const isTest = (k: AppointmentKind) => k === "theory_test" || k === "driving_test";

export type Fact = {
  kind: AppointmentKind;
  tone: "none" | "booked" | "done";
  auto: boolean; // grøn af sig selv fra scanningen
  current: Appointment | null; // den aftale, der bestemmer farven (booket eller bestået)
  history: Appointment[]; // alle aftaler, nyeste først
};


export function facts(modules: ModuleProgress[], appointments: Appointment[]): Fact[] {
  const ktaScanned = modules.some((m) => m.drivenTopics.some(isKtaTopic));
  const darkScanned = modules.some((m) => m.min_dark > 0 && m.darkDone);
  return APPOINTMENT_KINDS.map((kind) => {
    const history = appointments
      .filter((a) => a.kind === kind)
      .sort((a, b) => b.on_date.localeCompare(a.on_date) || b.created_at.localeCompare(a.created_at));
    const passed = history.find((a) => a.status === "passed") ?? null;
    const latest = history[0] ?? null;
    const auto = (kind === "kta" && ktaScanned) || (kind === "dark" && darkScanned);
    const booked = latest?.status === "booked" ? latest : null;
    const tone = passed || auto ? "done" : booked ? "booked" : "none";
    return { kind, tone, auto, current: passed ?? booked, history };
  });
}

// "Teoriprøve 2. december kl. 12:00, Adresse"
export function appointmentText(a: Appointment, formatDate: (iso: string) => string): string {
  const parts = [formatDate(a.on_date) + (a.at_time ? ` kl. ${a.at_time.slice(0, 5)}` : "")];
  if (a.address) parts.push(a.address);
  return parts.join(", ");
}

export function factText(f: Fact, formatDate: (iso: string) => string): string {
  if (f.tone === "done") {
    if (f.current?.status === "passed") return `${isTest(f.kind) ? "Bestået" : "Gennemført"} ${formatDate(f.current.on_date)}`;
    return "Kørt (scannet)";
  }
  if (f.tone === "booked" && f.current) return `Booket ${appointmentText(f.current, formatDate)}`;
  const failed = f.history[0]?.status === "failed" ? f.history[0] : null;
  return failed ? `Ikke bestået ${formatDate(failed.on_date)} – ny dato mangler` : "Ikke booket";
}
