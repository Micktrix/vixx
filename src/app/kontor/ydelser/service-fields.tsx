import { CheckChip, Fieldset, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { createClient } from "@/lib/supabase/server";

type Service = { name: string; rate_group_id: string; lesson_type_id: string; categories: string[] };

// Navn, sats, kategorier og type. Er ydelsen brugt, er typen låst, og kategorier kan kun tilføjes.
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
      <Fieldset
        legend="Kategorier"
        hint={
          locked
            ? "Ydelsen er brugt på lektioner: kategorier kan tilføjes, men ikke fjernes, og typen kan ikke ændres."
            : "Vælg en eller flere. Prisen er den samme for alle ydelsens kategorier."
        }
      >
        {(categories ?? []).map((c) => {
          const has = !!service?.categories.includes(c.code);
          return locked && has ? (
            // Låst og valgt: vises som valgt og sendes med som skjult felt.
            <span key={c.code} className="contents">
              <input type="hidden" name="categories" value={c.code} />
              <CheckChip name="categoriesLocked" value={c.code} label={c.code} defaultChecked disabled />
            </span>
          ) : (
            <CheckChip key={c.code} name="categories" value={c.code} label={c.code} defaultChecked={has} />
          );
        })}
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
