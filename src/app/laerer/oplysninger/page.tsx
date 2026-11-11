import { headers } from "next/headers";
import Link from "next/link";
import { ActionForm, TextField } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { CONTACT_FIELDS, KIN_FIELDS, type FieldDef } from "@/lib/instructor-fields";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../screen";
import { updateOwnDetails } from "./actions";
import { CalendarBox } from "./calendar-box";

export default async function OwnDetailsPage() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructors")
    .select("email, address, postal_code, city, next_of_kin_name, next_of_kin_relation, next_of_kin_phone, calendar_token")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .single();
  const values = (data ?? {}) as Record<string, string | null>;
  // Adressen til kalenderfilen, på det domæne appen kører på (fx test.vixx.dk).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "test.vixx.dk";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const calendarUrl = `${proto}://${host}/kalender/${values.calendar_token}.ics`;

  const back = (
    <Link href="/laerer/beskeder" className="text-sm font-semibold text-muted">
      Luk
    </Link>
  );

  return (
    <Screen title="Mine oplysninger" sub={user.fullName} action={back}>
      {values.calendar_token && <CalendarBox httpsUrl={calendarUrl} />}
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={updateOwnDetails} submitLabel="Gem oplysninger" className="flex flex-col gap-5">
          <Group legend="Kontakt" fields={CONTACT_FIELDS} values={values} />
          <Group legend="Nærmeste pårørende" fields={KIN_FIELDS} values={values} />
          <p className="text-[13px] text-muted">
            Navn og telefon ({formatPhone(user.phone)}) samt ansættelsesoplysninger rettes af kontoret.
          </p>
        </ActionForm>
      </section>
    </Screen>
  );
}

function Group({ legend, fields, values }: { legend: string; fields: FieldDef[]; values: Record<string, string | null> }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      {fields.map((f) => (
        <TextField key={f.key} label={f.label} name={f.key} type={f.type} inputMode={f.inputMode} defaultValue={values[f.key] ?? ""} />
      ))}
    </fieldset>
  );
}
