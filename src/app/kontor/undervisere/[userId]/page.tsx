import Link from "next/link";
import { notFound } from "next/navigation";
import { Box } from "@/components/box";
import { ActionForm, CheckChip, Fieldset, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { resetPassword, setMemberActive, setRoles, signOutEverywhere, updatePerson } from "../actions";
import { PERSON_SELECT, toPerson, type PersonRow } from "../people";
import { InstructorSections } from "./instructor-sections";

export default async function PersonPage({ params }: PageProps<"/kontor/undervisere/[userId]">) {
  const { userId } = await params;
  const { user, membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("school_members")
    .select(PERSON_SELECT)
    .eq("school_id", membership.schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) notFound();

  const person = toPerson(data as unknown as PersonRow);
  const isAdmin = membership.role === "admin";
  const isSelf = userId === user.id;
  // Samme regel som i serverhandlingerne: kontoret håndterer rene lærere, admin alle.
  const canManage = !isSelf && (isAdmin || person.role === "instructor");

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/kontor/undervisere" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Alle undervisere og brugere
        </Link>
        <h1 className="text-[30px] font-bold">{person.name}</h1>
        <p className="flex flex-wrap items-center gap-1.5 text-muted">
          Tlf. {formatPhone(person.phone)}
          {person.roles.map((r) => (
            <Pill key={r}>{r}</Pill>
          ))}
          <Pill tone={person.status.tone}>{person.status.label}</Pill>
        </p>
      </header>

      {canManage && (
        <section className="flex flex-wrap items-start gap-2">
          <ActionForm
            action={resetPassword}
            submitLabel="Nulstil kode"
            pendingLabel="Nulstiller …"
            confirmText={`Nulstil koden for ${person.name}? Personen bliver logget ud.`}
            primary={false}
          >
            <input type="hidden" name="userId" value={userId} />
          </ActionForm>
          <ActionForm action={signOutEverywhere} submitLabel="Log ud af alle enheder" pendingLabel="Logger ud …" primary={false}>
            <input type="hidden" name="userId" value={userId} />
          </ActionForm>
          <ActionForm
            action={setMemberActive}
            submitLabel={person.memberActive ? "Deaktivér" : "Genaktivér"}
            confirmText={
              person.memberActive
                ? `Deaktivér ${person.name}? Personen kan ikke længere logge ind eller planlægges. Historik og løn bevares.`
                : undefined
            }
            primary={false}
          >
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="active" value={person.memberActive ? "false" : "true"} />
          </ActionForm>
        </section>
      )}

      <div className="grid gap-[18px] lg:grid-cols-2">
        {canManage && (
          <Box title="Person">
            <ActionForm action={updatePerson} submitLabel="Gem">
              <input type="hidden" name="userId" value={userId} />
              <TextField label="Navn" name="fullName" defaultValue={person.name} required />
              <TextField
                label="Telefon (bruges til login)"
                name="phone"
                type="tel"
                defaultValue={formatPhone(person.phone)}
                required
              />
            </ActionForm>
          </Box>
        )}

        {isAdmin && (
          <Box title="Roller">
            <ActionForm action={setRoles} submitLabel="Gem roller">
              <input type="hidden" name="userId" value={userId} />
              <Fieldset
                legend="Personen har adgang som"
                hint="Fjernes rollen Lærer, bevares lærerens historik og løn."
              >
                <CheckChip name="roles" value="admin" label="Admin" defaultChecked={person.role === "admin"} />
                <CheckChip name="roles" value="office" label="Kontor" defaultChecked={person.role === "office"} />
                <CheckChip name="roles" value="instructor" label="Lærer" defaultChecked={person.teaches} />
              </Fieldset>
            </ActionForm>
          </Box>
        )}
      </div>

      {person.instructor && (
        <InstructorSections
          instructorId={person.instructor.id}
          schoolId={membership.schoolId}
          isAdmin={isAdmin}
          roleOff={!person.instructor.active}
        />
      )}
    </>
  );
}
