import { CheckChip, Fieldset, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { createClient } from "@/lib/supabase/server";

type Service = { name: string; rate_group_id: string; category_code: string; lesson_type_id: string };

// Navn, sats, kategori og type. Er ydelsen brugt, er kategori og type låst (og sendes ikke med).
export async function ServiceFields({ schoolId, service, locked }: { schoolId: string; service?: Service; locked?: boolean }) {
  const supabase = await createClient();
  const [{ data: rateGroups }, { data: categories }, { data: lessonTypes }] = await Promise.all([
    supabase.from("rate_groups").select("id, name, active").eq("school_id", schoolId).order("name"),
    supabase.from("license_categories").select("code").order("sort_order"),
    supabase.from("lesson_types").select("id, name, active").eq("school_id", schoolId).order("sort_order"),
  ]);

  const shownGroups = (rateGroups ?? []).filter((g) => g.active || g.id === service?.rate_group_id);
  const shownTypes = (lessonTypes ?? []).filter((t) => t.active || t.id === service?.lesson_type_id);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Navn" name="name" required maxLength={40} defaultValue={service?.name} placeholder="Fx Aften Amu C/E" />
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Sats
          <select name="rateGroupId" required defaultValue={service?.rate_group_id ?? ""} className={inputClass}>
            <option value="" disabled>
              Vælg sats
            </option>
            {shownGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.active ? "" : " (slået fra)"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Fieldset legend="Kategori" hint={locked ? "Ydelsen er brugt på lektioner, så kategori og type kan ikke ændres." : undefined}>
        {(categories ?? []).map((c) => (
          <CheckChip
            key={c.code}
            type="radio"
            name="category"
            value={c.code}
            label={c.code}
            required
            disabled={locked}
            defaultChecked={service?.category_code === c.code}
          />
        ))}
      </Fieldset>
      <Fieldset legend="Type">
        {shownTypes.map((t) => (
          <CheckChip
            key={t.id}
            type="radio"
            name="lessonTypeId"
            value={t.id}
            label={t.active ? t.name : `${t.name} (slået fra)`}
            required
            disabled={locked}
            defaultChecked={service?.lesson_type_id === t.id}
          />
        ))}
      </Fieldset>
    </>
  );
}
