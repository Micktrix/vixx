import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadResources } from "@/lib/booking-data";
import { AddResourceForm } from "./add-resource-form";
import { deleteResource, updateResource, updateSchool } from "./actions";

export default async function OfficeSettingsPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();

  const [resources, { data: school }] = await Promise.all([
    loadResources(membership.schoolId, true),
    supabase.from("schools").select("name, lesson_minutes, pay_period_start_day").eq("id", membership.schoolId).single(),
  ]);

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Indstillinger</h1>
      </header>

      <Box title="Skolen" hint={isAdmin ? undefined : "Kun admin kan rette skolens indstillinger."}>
        {isAdmin ? (
          <ActionForm action={updateSchool} submitLabel="Gem" className="flex flex-col gap-3">
            <fieldset disabled={!isAdmin} className="grid gap-3 sm:grid-cols-3">
              <TextField label="Navn" name="name" defaultValue={school?.name} required maxLength={80} />
              <TextField
                label="Lektionslængde (min.)"
                name="lessonMinutes"
                type="number"
                min={15}
                max={240}
                defaultValue={school?.lesson_minutes}
                required
                hint="Gælder nye lektioner. Planlagte og registrerede beholder deres længde."
              />
              <TextField
                label="Lønperioden starter den"
                name="payPeriodStartDay"
                type="number"
                min={1}
                max={28}
                defaultValue={school?.pay_period_start_day}
                required
                hint="Fx 21 for perioden 21.–20. Skift helst ikke midt i en periode."
              />
            </fieldset>
          </ActionForm>
        ) : (
            <fieldset disabled={!isAdmin} className="grid gap-3 sm:grid-cols-3">
              <TextField label="Navn" name="name" defaultValue={school?.name} required maxLength={80} />
              <TextField
                label="Lektionslængde (min.)"
                name="lessonMinutes"
                type="number"
                min={15}
                max={240}
                defaultValue={school?.lesson_minutes}
                required
                hint="Gælder nye lektioner. Planlagte og registrerede beholder deres længde."
              />
              <TextField
                label="Lønperioden starter den"
                name="payPeriodStartDay"
                type="number"
                min={1}
                max={28}
                defaultValue={school?.pay_period_start_day}
                required
                hint="Fx 21 for perioden 21.–20. Skift helst ikke midt i en periode."
              />
            </fieldset>
        )}
      </Box>

      <Box title="Lokaler og køretøjer" hint="Kan bookes af kontoret og lærerne. Ubrugte kan slettes; brugte kan slås fra.">
        <ul className="flex flex-col gap-2">
          {resources.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-bg px-3 py-2.5" data-testid="resource-setting">
              <ActionForm action={updateResource} submitLabel="Gem" primary={false} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={r.id} />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-16 text-sm text-muted">{r.kind === "room" ? "Lokale" : "Køretøj"}</span>
                  <input name="name" aria-label="Navn" defaultValue={r.name} required className={`${inputClass} max-w-[220px]`} />
                  <label className="flex items-center gap-2 text-[15px]">
                    <input type="checkbox" name="active" defaultChecked={r.active} className="size-[18px] accent-accent" />
                    I brug
                  </label>
                </div>
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
        <AddResourceForm />
      </Box>
    </>
  );
}
