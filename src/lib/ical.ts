// Kalenderfil (iCalendar, RFC 5545), som telefonens kalender abonnerer på. Tider er dansk lokaltid.

export type CalendarEvent =
  | { uid: string; date: string; from: number; to: number; summary: string; description?: string; location?: string }
  | { uid: string; date: string; endDate: string; allDay: true; summary: string; description?: string };

const TZ = "Europe/Copenhagen";

// Dansk tid med sommertid (sidste søndag i marts og oktober).
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const ymd = (iso: string) => iso.replaceAll("-", "");
const hms = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;

// Lange linjer foldes efter 75 bytes; fortsættelser starter med et mellemrum.
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildCalendar(name: string, events: CalendarEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vixx//Kalender//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    // Bed telefonen hente ændringer hver time (Google bestemmer selv).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@vixx.dk`, `DTSTAMP:${stamp}`);
    if ("allDay" in e) {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(e.endDate)}`, "TRANSP:TRANSPARENT");
    } else {
      lines.push(`DTSTART;TZID=${TZ}:${ymd(e.date)}T${hms(e.from)}`, `DTEND;TZID=${TZ}:${ymd(e.date)}T${hms(e.to)}`);
      if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
