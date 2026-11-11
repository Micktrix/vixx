// Backup af timer: CSV med alle registreringer (godkendte, afventende og afviste) i den igangværende og
// den forrige lønperiode. Uden elevnavne og noter. Åbnes i Excel (semikolon, dansk decimaltal).

import { periodFor, previousPeriod, type PayPeriod } from "./pay-period";
import { decimal } from "./payroll";
import { fromMinutes, toMinutes } from "./schedule";

export type BackupRow = {
  instructorName: string;
  employeeNumber: string | null;
  date: string;
  start: string; // "08:00"
  minutes: number; // lektionslængde
  count: number;
  serviceName: string;
  status: "pending" | "approved" | "rejected";
  unitPriceOre: number | null; // låst sats for godkendte, ellers den sats, der gælder nu
};

const STATUS = { pending: "Afventer", approved: "Godkendt", rejected: "Afvist" } as const;

// Den igangværende og den forrige lønperiode.
export function backupRange(today: string, startDay: number): PayPeriod {
  const current = periodFor(today, startDay);
  return { start: previousPeriod(current, startDay).start, end: current.end };
}

const BOM = String.fromCharCode(0xfeff);
const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function backupCsv(rows: BackupRow[]): string {
  const header = ["Lærer", "Medarbejdernr", "Dato", "Start", "Slut", "Ydelse", "Antal", "Status", "Sats", "Beløb"];
  const sorted = [...rows].sort(
    (a, b) => a.instructorName.localeCompare(b.instructorName, "da") || a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
  const lines = sorted.map((r) => [
    r.instructorName,
    r.employeeNumber ?? "",
    r.date,
    r.start,
    fromMinutes(toMinutes(r.start) + r.count * r.minutes),
    r.serviceName,
    String(r.count),
    STATUS[r.status],
    r.unitPriceOre === null ? "" : decimal(r.unitPriceOre),
    r.unitPriceOre === null ? "" : decimal(r.count * r.unitPriceOre),
  ]);
  // BOM, så Excel læser æ, ø og å rigtigt.
  return BOM + [header, ...lines].map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
}

export const backupFileName = (schoolName: string, today: string) =>
  `vixx-timer-${schoolName.toLowerCase().replace(/[^a-z0-9æøå]+/g, "-").replace(/^-|-$/g, "")}-${today}.csv`;
