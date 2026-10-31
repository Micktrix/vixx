import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadResources } from "@/lib/booking-data";
import { addLessonType, addResource, updateLessonType, updateResource } from "./actions";

export default async function OfficeSettingsPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();

  const [{ data: types }, resources, { data: categories }] = await Promise.all([
    supabase.from("lesson_types").select("id, name, active").eq("school_id", membership.schoolId).order("sort_order"),
    loadResources(membership.schoolId, true),
    supabase.from("license_categories").select("code").order("sort_order"),
  ]);
  const categoryOptions = (
    <>
      <option value="">Ingen kategori</option>
      {(categories ?? []).map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
        </option>
      ))}
    </>
  );

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Indstillinger</h1>
      </header>

      <Box title="Typer" hint="Fx Kørsel, Teori og Manøvre. Bruges på ydelser og som lærerens kompetencer.">
        {isAdmin ? (
          <>
            <ul className="flex flex-col gap-2">
              {(types ?? []).map((t) => (
                <li key={t.id} className="rounded-xl border border-line bg-bg px-3 py-2.5">
                  <ActionForm
                    action={updateLessonType}
                    submitLabel="Gem"
                    primary={false}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      name="name"
                      aria-label="Navn på typen"
                      defaultValue={t.name}
                      required
                      className={`${inputClass} max-w-[240px]`}
                    />
                    <label className="flex items-center gap-2 text-[15px]">
                      <input type="checkbox" name="active" defaultChecked={t.active} className="size-[18px] accent-accent" />
                      I brug
                    </label>
                  </ActionForm>
                </li>
              ))}
            </ul>
            <ActionForm action={addLessonType} submitLabel="Tilføj type" className="flex flex-wrap items-end gap-3">
              <TextField label="Ny type" name="name" required className="max-w-[240px] flex-1" />
            </ActionForm>
            <p className="text-[13px] text-muted">
              En type, der ikke er i brug, kan ikke vælges på nye ydelser eller kompetencer. Den slettes ikke, så historikken bevares.
            </p>
          </>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {(types ?? []).map((t) => (
                <li key={t.id}>
                  <Pill tone={t.active ? "neutral" : "bad"}>{t.active ? t.name : `${t.name} (slået fra)`}</Pill>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted">Kun admin kan rette typer.</p>
          </>
        )}
      </Box>
      <Box title="Lokaler og køretøjer" hint="Kan bookes af kontoret og lærerne. Et køretøj kan have en kategori.">
        <ul className="flex flex-col gap-2">
          {resources.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-bg px-3 py-2.5" data-testid="resource-setting">
              <ActionForm action={updateResource} submitLabel="Gem" primary={false} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="kind" value={r.kind} />
                <span className="w-20 text-sm text-muted">{r.kind === "room" ? "Lokale" : "Køretøj"}</span>
                <input name="name" aria-label="Navn" defaultValue={r.name} required className={`${inputClass} max-w-[220px]`} />
                {r.kind === "vehicle" && (
                  <select name="category" aria-label="Kategori" defaultValue={r.category ?? ""} className={`${inputClass} w-auto`}>
                    {categoryOptions}
                  </select>
                )}
                <label className="flex items-center gap-2 text-[15px]">
                  <input type="checkbox" name="active" defaultChecked={r.active} className="size-[18px] accent-accent" />
                  I brug
                </label>
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={addResource} submitLabel="Tilføj" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Type
            <select name="kind" defaultValue="room" className={`${inputClass} w-auto`}>
              <option value="room">Lokale</option>
              <option value="vehicle">Køretøj</option>
            </select>
          </label>
          <TextField label="Navn" name="name" required className="max-w-[220px] flex-1" placeholder="Fx Personbil 2" />
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Kategori (køretøj)
            <select name="category" defaultValue="" className={`${inputClass} w-auto`}>
              {categoryOptions}
            </select>
          </label>
        </ActionForm>
      </Box>
    </>
  );
}
