import "server-only";
import { backupCsv, backupFileName, backupRange, type BackupRow } from "@/lib/backup";
import { formatDate, todayDk } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";

// Afsendelse af backup-mails via Resend (EU). Kører med serverens rettigheder, fordi den natlige
// kørsel ikke har en bruger. Kaldes kun fra den beskyttede cron-rute eller efter et admin-tjek.

const FROM = process.env.BACKUP_FROM ?? "Vixx backup <backup@mail.vixx.dk>";

type Mail = { to: string; subject: string; text: string; attachment?: { filename: string; content: string } };

export async function sendMail(mail: Mail): Promise<{ error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: "Mail er ikke sat op endnu (mangler RESEND_API_KEY)." };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      attachments: mail.attachment
        ? [{ filename: mail.attachment.filename, content: Buffer.from(mail.attachment.content, "utf8").toString("base64") }]
        : undefined,
    }),
  });
  if (!res.ok) return { error: `Mailen kunne ikke sendes (${res.status}).` };
  return {};
}

type Row = {
  lesson_date: string;
  start_time: string;
  lesson_minutes: number;
  lesson_count: number;
  status: BackupRow["status"];
  unit_price_ore: number | null;
  services: { name: string } | null;
  instructors: { employee_number: string | null; school_members: { profiles: { full_name: string } | null } | null } | null;
};

// Send backup for én skole. Gemmer tidspunkt eller fejl, så admin kan se, om det virker.
export async function sendSchoolBackup(schoolId: string): Promise<{ error?: string; count?: number }> {
  const admin = createAdminClient();
  const today = todayDk();
  const [{ data: school }, { data: backup }] = await Promise.all([
    admin.from("schools").select("name, pay_period_start_day").eq("id", schoolId).single(),
    admin.from("school_backups").select("email").eq("school_id", schoolId).maybeSingle(),
  ]);
  if (!school) return { error: "Skolen findes ikke." };
  if (!backup?.email) return { error: "Skriv en backup-e-mail først." };

  const range = backupRange(today, school.pay_period_start_day);
  const { data, error } = await admin
    .from("registrations")
    .select(
      "lesson_date, start_time, lesson_minutes, lesson_count, status, unit_price_ore, services(name), instructors(employee_number, school_members(profiles(full_name)))",
    )
    .eq("school_id", schoolId)
    .gte("lesson_date", range.start)
    .lte("lesson_date", range.end);
  if (error) return record(schoolId, "Timerne kunne ikke hentes.");

  const rows: BackupRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    instructorName: r.instructors?.school_members?.profiles?.full_name ?? "",
    employeeNumber: r.instructors?.employee_number ?? null,
    date: r.lesson_date,
    start: r.start_time.slice(0, 5),
    minutes: r.lesson_minutes,
    count: r.lesson_count,
    serviceName: r.services?.name ?? "",
    status: r.status,
    unitPriceOre: r.unit_price_ore,
  }));

  const sent = await sendMail({
    to: backup.email,
    subject: `Backup af timer – ${school.name} – ${formatDate(today)}`,
    text:
      `Vedhæftet er alle registrerede timer for ${school.name} fra ${formatDate(range.start)} til ${formatDate(range.end)} ` +
      `(${rows.length} registreringer: godkendte, afventende og afviste). Filen kan åbnes i Excel.\n\n` +
      `Gem mailen. Den bruges, hvis Vixx en dag ikke kan bruges.\n\nVenlig hilsen\nVixx`,
    attachment: { filename: backupFileName(school.name, today), content: backupCsv(rows) },
  });
  if (sent.error) return record(schoolId, sent.error);
  await admin.from("school_backups").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("school_id", schoolId);
  return { count: rows.length };
}

async function record(schoolId: string, error: string) {
  await createAdminClient().from("school_backups").update({ last_error: error }).eq("school_id", schoolId);
  return { error };
}

// Den natlige kørsel: alle skoler med en backup-adresse.
export async function sendAllBackups() {
  const { data } = await createAdminClient().from("school_backups").select("school_id").not("email", "is", null);
  const results = [];
  for (const b of data ?? []) results.push({ schoolId: b.school_id, ...(await sendSchoolBackup(b.school_id)) });
  return results;
}
