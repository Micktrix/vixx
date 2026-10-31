// Datoer gemmes som "YYYY-MM-DD" og er dansk lokaltid.

const TIME_ZONE = "Europe/Copenhagen";

// Dagens dato i Danmark som "YYYY-MM-DD" (svensk format er netop ISO).
export function todayDk(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(now);
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

// "20. nov. 2026"
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(parse(iso));
}

// "Torsdag 29. oktober"
export function formatLongDate(iso: string): string {
  const s = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(parse(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Gyldig dato fra et <input type="date">, ellers null.
export function parseDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parse(value);
  return d.toISOString().slice(0, 10) === value ? value : null;
}

// Dato n dage fra iso-datoen.
export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 0 = mandag … 6 = søndag (danske uger starter mandag).
export const weekdayIndex = (iso: string) => (parse(iso).getUTCDay() + 6) % 7;

export const weekStart = (iso: string) => addDays(iso, -weekdayIndex(iso));

export const monthStart = (iso: string) => iso.slice(0, 8) + "01";

export function addMonths(iso: string, n: number): string {
  const d = parse(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

// ISO-ugenummer: ugen tilhører det år, dens torsdag ligger i.
export function weekNumber(iso: string): number {
  const thursday = parse(addDays(iso, 3 - weekdayIndex(iso)));
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  const firstThursday = parse(addDays(jan4.toISOString().slice(0, 10), 3 - ((jan4.getUTCDay() + 6) % 7)));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

// "man. 2. nov."
export function formatShortDay(iso: string): string {
  return new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(parse(iso));
}

// "November 2026"
export function formatMonth(iso: string): string {
  const s = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const isWeekend = (iso: string) => weekdayIndex(iso) >= 5;
