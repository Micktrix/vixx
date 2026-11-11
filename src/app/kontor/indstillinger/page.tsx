import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { loadResources, type Resource } from "@/lib/booking-data";
import { AddResourceForm } from "./add-resource-form";
import { BackupForm } from "./backup-form";
import { deleteResource, updateResource, updateSchool } from "./actions";

export default async function OfficeSettingsPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();

  const [resources, { data: school }, { data: backup }] = await Promise.all([
    loadResources(membership.schoolId, true),
    supabase.from("schools").select("name, lesson_minutes, pay_period_start_day").eq("id", membership.schoolId).single(),
    // Kun admin kan se adressen (RLS); for kontoret er svaret tomt.
    supabase.from("school_backups").select("email, last_sent_at, last_error").eq("school_id", membership.schoolId).maybeSingle(),
  ]);

  const schoolFields = (
    <fieldset disabled={!isAdmin} className="flex flex-col gap-3">
      <div className="grid items-end gap-3 sm:grid-cols-3">
        <TextField label="Navn" name="name" defaultValue={school?.name} required maxLength={80} />
        <TextField
          label="Lektionslængde (min.)"
          name="lessonMinutes"
          type="number"
          min={15}
          max={240}
          defaultValue={school?.lesson_minutes}
          required
        />
        <TextField
          label="Lønperioden starter den"
          name="payPeriodStartDay"
          type="number"
          min={1}
          max={28}
          defaultValue={school?.pay_period_start_day}
          required
        />
      </div>
      <p className="text-[13px] font-normal text-muted">
        Lektionslængden gælder nye lektioner. Lønperioden går fx fra den 21. til den 20.; skift helst ikke midt i en periode.
      </p>
    </fieldset>
  );
  const sentAt = backup?.last_sent_at ? new Date(backup.last_sent_at) : null;

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Indstillinger</h1>
      </header>

      <div className="flex flex-col gap-[18px]">
        <Box title="Nyt lokale eller køretøj">
          <AddResourceForm />
        </Box>

        <Box title="Skolen" hint={isAdmin ? undefined : "Kun admin kan rette skolens indstillinger."}>
          {isAdmin ? (
            <ActionForm action={updateSchool} submitLabel="Gem" className="flex flex-col gap-3">
              {schoolFields}
            </ActionForm>
          ) : (
            schoolFields
          )}
        </Box>

        {isAdmin && (
          <Box title="Backup af timer">
            <p className="text-[14px] text-muted">
              Hver nat sendes alle timer i den igangværende og forrige lønperiode som Excel-fil til adressen (uden elevnavne).
              Kun admin kan se og rette den. Ændres den, får den gamle adresse besked.
            </p>
            <BackupForm email={backup?.email ?? ""} />
            {backup?.email && (
              <p className="text-[13px] text-muted" data-testid="backup-status">
                {backup.last_error
                  ? `Sidste forsøg fejlede: ${backup.last_error}`
                  : sentAt
                    ? `Sidst sendt ${formatDate(backup.last_sent_at!.slice(0, 10))} kl. ${sentAt.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" })}.`
                    : "Ikke sendt endnu. Første backup sendes i nat."}
              </p>
            )}
          </Box>
        )}
      </div>

      <ResourceList title="Køretøjer" resources={resources.filter((r) => r.kind === "vehicle")} />
      <ResourceList title="Lokaler" resources={resources.filter((r) => r.kind === "room")} />
    </>
  );
}

// Oprettede lokaler eller køretøjer i en fold-ud-liste. Ubrugte kan slettes; brugte kan kun slås fra.
function ResourceList({ title, resources }: { title: string; resources: Resource[] }) {
  return (
    <details className="group rounded-[20px] border border-line bg-surface" data-testid="resource-list">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-[18px]">
        <h2 className="text-lg font-bold">
          {title} <span className="text-base font-normal text-muted">({resources.length})</span>
        </h2>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-2 px-[18px] pb-[18px]">
        <p className="text-[13px] text-muted">Kan bookes af kontoret og lærerne. Ubrugte kan slettes; brugte kan slås fra.</p>
        {!resources.length && <p className="text-muted">Ingen endnu.</p>}
        <ul className="flex flex-col gap-2">
          {resources.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-bg px-3 py-2.5"
              data-testid="resource-setting"
            >
              <ActionForm action={updateResource} submitLabel="Gem" primary={false} className="flex flex-1 flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={r.id} />
                <input name="name" aria-label="Navn" defaultValue={r.name} required className={`${inputClass} max-w-[240px]`} />
                <label className="flex h-[42px] items-center gap-2 text-[15px]">
                  <input type="checkbox" name="active" defaultChecked={r.active} className="size-[18px] accent-accent" />
                  I brug
                </label>
              </ActionForm>
              <ActionForm
                action={deleteResource}
                submitLabel="Slet"
                pendingLabel="…"
                primary={false}
                confirmText={`Slet ${r.name}?`}
                className="flex flex-col items-end gap-1"
              >
                <input type="hidden" name="id" value={r.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
