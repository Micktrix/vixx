import { formatDate } from "./dates";
import { formatKroner } from "./money";

// Ændringsloggen i et sprog, kontoret forstår. Rå data kommer fra private.write_audit:
// insert/delete har hele rækken, update har { felt: { old, new } }. Følsomme felter er allerede skjult.

export const TABLE_LABEL: Record<string, string> = {
  scheduled_lessons: "Planlagt lektion",
  registrations: "Registrering",
  absences: "Fravær",
  holidays: "Ferie",
  availability: "Kan arbejde",
  instructors: "Underviser",
  instructor_categories: "Kategori-kompetence",
  instructor_lesson_types: "Type-kompetence",
  instructor_prices: "Egen pris",
  school_members: "Bruger på skolen",
  profiles: "Profil",
  schools: "Skole",
  lesson_types: "Type",
  rate_groups: "Sats",
  services: "Ydelse",
  service_categories: "Ydelsens kategori",
  service_prices: "Pris",
  pay_periods: "Lønperiode",
  messages: "Besked",
  resources: "Lokale/køretøj",
  bookings: "Booking",
};

export const ACTION_LABEL: Record<string, string> = { insert: "Oprettede", update: "Rettede", delete: "Slettede" };

const FIELD_LABEL: Record<string, string> = {
  full_name: "navn",
  role: "rolle",
  active: "aktiv",
  lesson_date: "dato",
  absence_date: "dato",
  available_date: "dato",
  start_time: "start",
  end_time: "slut",
  lesson_count: "antal",
  hours: "timer",
  reason: "årsag",
  note: "note",
  student_name: "elev",
  status: "status",
  decision_comment: "kommentar",
  service_id: "ydelse",
  instructor_id: "underviser",
  category_code: "kategori",
  lesson_type_id: "type",
  rate_group_id: "sats",
  amount_ore: "beløb",
  locked_unit_price_ore: "låst pris",
  valid_from: "gælder fra",
  from_date: "fra",
  to_date: "til",
  name: "navn",
  payroll_code: "løndel",
  availability: "tilgængelighed",
  is_guest: "gæst",
  guest_company: "firma",
  active_until: "aktiv til",
  employee_number: "medarbejdernr.",
  locked: "låst",
  body: "tekst",
  starts_on: "fra",
  ends_on: "til",
};

const VALUE_LABEL: Record<string, string> = {
  pending: "afventer",
  approved: "godkendt",
  rejected: "afvist",
  sick: "syg",
  off: "fri",
  other: "andet",
  fixed: "fast",
  on_request: "efter aftale",
  admin: "admin",
  office: "kontor",
  instructor: "lærer",
};

// Felter, der ikke siger kontoret noget i en logtekst.
const HIDDEN = new Set([
  "id", "school_id", "user_id", "created_by", "decided_by", "decided_at", "office_edited_by", "office_edited_at",
  "locked_by", "locked_at", "lesson_minutes", "origin", "scheduled_lesson_id", "student_id", "settings", "sent_by",
  "kind", "recipient_instructor_id", "must_change_password", "sort_order",
]);

// Vigtigste felter først, så en linje læses "underviser, ydelse, dato, tid, antal …".
const ORDER = [
  "full_name", "name", "instructor_id", "service_id", "category_code", "lesson_date", "absence_date", "available_date",
  "from_date", "to_date", "starts_on", "ends_on", "start_time", "end_time", "lesson_count", "hours", "reason", "status",
  "decision_comment", "amount_ore", "locked_unit_price_ore", "valid_from",
];
const rank = (key: string) => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length);

export type Names = { instructors: Map<string, string>; services: Map<string, string>; other: Map<string, string> };

export function formatValue(key: string, value: unknown, names: Names): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "ja" : "nej";
  if (typeof value === "number") return key.endsWith("_ore") ? formatKroner(value) : String(value).replace(".", ",");
  const s = String(value);
  if (key === "instructor_id") return names.instructors.get(s) ?? "ukendt underviser";
  if (key === "service_id") return names.services.get(s) ?? "ukendt ydelse";
  if (/_id$/.test(key)) return names.other.get(s) ?? "–";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDate(s);
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  return VALUE_LABEL[s] ?? s;
}

export type AuditEntry = { action: string; table_name: string; changes: Record<string, unknown> };

// Overskrift og detaljer til én linje i loggen.
export function describe(entry: AuditEntry, names: Names): { title: string; details: string[] } {
  const title = `${ACTION_LABEL[entry.action] ?? entry.action} ${(TABLE_LABEL[entry.table_name] ?? entry.table_name).toLowerCase()}`;
  const label = (k: string) => FIELD_LABEL[k] ?? k.replace(/_/g, " ");
  const details: string[] = [];

  const fields = Object.entries(entry.changes ?? {}).sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [key, raw] of fields) {
    if (HIDDEN.has(key)) continue;
    if (entry.action === "update") {
      if (raw && typeof raw === "object" && "old" in raw && "new" in raw) {
        const change = raw as { old: unknown; new: unknown };
        details.push(`${label(key)}: ${formatValue(key, change.old, names)} → ${formatValue(key, change.new, names)}`);
      } else {
        details.push(`${label(key)}: ${String(raw)}`); // fx "(ændret)" for følsomme felter
      }
    } else if (raw !== null && raw !== "") {
      details.push(`${label(key)}: ${formatValue(key, raw, names)}`);
    }
  }
  return { title, details };
}
