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
