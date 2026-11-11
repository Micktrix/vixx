import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { todayDk } from "@/lib/dates";
import { CONTACT_FIELDS, EMPLOYMENT_FIELDS, KIN_FIELDS, type FieldDef } from "@/lib/instructor-fields";
import { formatKroner } from "@/lib/money";
import { priceOn } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import {
  setAvailability,
  updateInstructorDetails,
  updateInstructorPrices,
} from "../instructor-actions";

type Instructor = Record<string, string | boolean | null> & {
  id: string;
  is_guest: boolean;
  guest_company: string | null;
  active_until: string | null;
  availability: "fixed" | "on_request";
};

// Lærerens stamdata, tilgængelighed og egne satser.
export async function InstructorSections({
  instructorId,
  schoolId,
  isAdmin,
  roleOff,
}: {
  instructorId: string;
  schoolId: string;
  isAdmin: boolean;
  roleOff: boolean;
}) {
  const supabase = await createClient();
  const { data: instructor } = await supabase.from("instructors").select("*").eq("id", instructorId).single();
  if (!instructor) return null;

  const i = instructor as unknown as Instructor;

  return (
    <>
      <h2 className="mt-2 text-xl font-bold">Lærer</h2>
      {roleOff && (
        <p className="rounded-xl border border-line bg-soft px-3.5 py-3 text-sm text-muted">
          Lærerrollen er slået fra. Oplysningerne er gemt, men personen kan ikke planlægges.
        </p>
      )}

      <Box title="Stamdata" hint="Bankoplysninger gemmes ikke. Løn udbetales via Dataløn til NemKonto.">
        <ActionForm action={updateInstructorDetails} submitLabel="Gem stamdata" className="flex flex-col gap-5">
          <input type="hidden" name="instructorId" value={i.id} />
          <FieldGroup legend="Ansættelse" fields={EMPLOYMENT_FIELDS} values={i} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-bold">Gæstelærer</legend>
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="isGuest" defaultChecked={i.is_guest} className="size-[18px] accent-accent" />
              Gæstelærer (afregnes via faktura, ikke med i Dataløn-eksporten)
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Firma / køreskole" name="guestCompany" defaultValue={i.guest_company ?? ""} />
              <TextField
                label="Aktiv til"
                name="activeUntil"
                type="date"
                defaultValue={i.active_until ?? ""}
                hint="Efter datoen kan personen ikke logge ind som lærer eller planlægges."
              />
            </div>
          </fieldset>
          <FieldGroup legend="Kontakt" fields={CONTACT_FIELDS} values={i} />
          <FieldGroup legend="Nærmeste pårørende" fields={KIN_FIELDS} values={i} />
        </ActionForm>
      </Box>

        <Box title="Tilgængelighed">
          <ActionForm action={setAvailability} submitLabel="Gem" className="flex flex-col gap-3">
            <input type="hidden" name="instructorId" value={i.id} />
            <label className="flex items-start gap-2.5 text-[15px]">
              <input
                type="radio"
                name="availability"
                value="fixed"
                defaultChecked={i.availability === "fixed"}
                className="mt-1 size-[18px] accent-accent"
              />
              <span>
                <b>Fast</b>
                <span className="block text-sm text-muted">Regnes som tilgængelig alle dage. De fleste står her.</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-[15px]">
              <input
                type="radio"
                name="availability"
                value="on_request"
                defaultChecked={i.availability === "on_request"}
                className="mt-1 size-[18px] accent-accent"
              />
              <span>
                <b>Efter aftale</b>
                <span className="block text-sm text-muted">
                  Melder selv &quot;Jeg kan arbejde&quot; i appen og vises kun som ledig på de datoer og tider.
                </span>
              </span>
            </label>
          </ActionForm>
        </Box>

      {isAdmin && <PriceBox instructorId={i.id} schoolId={schoolId} />}
    </>
  );
}

function FieldGroup({ legend, fields, values }: { legend: string; fields: FieldDef[]; values: Instructor }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            name={f.key}
            type={f.type}
            inputMode={f.inputMode}
            defaultValue={(values[f.key] as string | null) ?? ""}
          />
        ))}
      </div>
    </fieldset>
  );
}

// Kun admin ser og retter satser. Viser ydelser i brug, plus dem med egen sats.
async function PriceBox({
  instructorId,
  schoolId,
}: {
  instructorId: string;
  schoolId: string;
}) {
  const supabase = await createClient();
  const today = todayDk();
  const [{ data: services }, { data: prices }, { data: own }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, active")
      .eq("school_id", schoolId)
      .order("name"),
    supabase.from("service_prices").select("service_id, valid_from, amount_ore").eq("school_id", schoolId),
    supabase.from("instructor_prices").select("service_id, amount_ore").eq("instructor_id", instructorId),
  ]);

  const ownPrice = new Map((own ?? []).map((p) => [p.service_id, p.amount_ore]));
  // Standardprisen i dag (samme regel som i databasen: første pris gælder også bagud).
  const byService = new Map<string, { valid_from: string; amount_ore: number }[]>();
  for (const p of prices ?? []) byService.set(p.service_id, [...(byService.get(p.service_id) ?? []), p]);
  const standard = new Map(
    [...byService].map(([id, list]) => {
      const p = priceOn(list, today);
      return [id, p ? { from: p.valid_from, ore: p.amount_ore } : null] as const;
    }),
  );

  const rows = (services ?? []).filter((s) => s.active || ownPrice.has(s.id));

  return (
    <Box title="Satser pr. ydelse" hint="Tom = ydelsens sats. Skriv et beløb for en egen sats.">
      {rows.length === 0 ? (
        <p className="text-muted">
          Ingen ydelser endnu. Ydelser oprettes under Ydelser og satser.
        </p>
      ) : (
        <ActionForm action={updateInstructorPrices} submitLabel="Gem satser">
          <input type="hidden" name="instructorId" value={instructorId} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[15px]">
              <thead className="text-[13px] text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Ydelse</th>
                  <th className="py-2 pr-3 text-right font-semibold">Standard</th>
                  <th className="py-2 text-right font-semibold">Egen sats (kr.)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const std = standard.get(s.id);
                  const mine = ownPrice.get(s.id);
                  return (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-2.5 pr-3">
                        <b>{s.name}</b>
                        {!s.active && <span className="block text-[13px] text-muted">Slået fra</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">{std ? formatKroner(std.ore) : "–"}</td>
                      <td className="py-2.5 text-right">
                        <input
                          name={`price_${s.id}`}
                          aria-label={`Egen sats for ${s.name}`}
                          inputMode="decimal"
                          placeholder="–"
                          defaultValue={mine != null ? String(mine / 100).replace(".", ",") : ""}
                          className={`${inputClass} ml-auto max-w-[120px] text-right`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ActionForm>
      )}
    </Box>
  );
}
