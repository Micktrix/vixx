import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addLessonType, updateLessonType } from "./actions";

export default async function OfficeSettingsPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();

  const { data: types } = await supabase
    .from("lesson_types")
    .select("id, name, active")
    .eq("school_id", membership.schoolId)
    .order("sort_order");

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
    </>
  );
}
