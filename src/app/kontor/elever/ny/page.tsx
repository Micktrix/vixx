import Link from "next/link";
import { ActionForm, TextField } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createStudent } from "../actions";
import { loadStudents } from "../data";
import { StudentFields } from "../student-fields";

export default async function NewStudentPage({ searchParams }: PageProps<"/kontor/elever/ny">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ teams, courses }, { data: services }] = await Promise.all([
    loadStudents(membership.schoolId),
    supabase.from("services").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("sort_order").order("name"),
  ]);
  const teamId = typeof sp.hold === "string" ? sp.hold : null;
  const team = teams.find((t) => t.id === teamId && t.active);

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={team ? `/kontor/elever/hold/${team.id}` : "/kontor/elever"} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ {team ? team.name : "Elever/hold"}
        </Link>
        <h1 className="text-[30px] font-bold">Ny elev</h1>
        <p className="text-muted">Telefonnummeret bliver både brugernavn og første kode. Ved første login vælger eleven sin egen kode.</p>
      </header>
      <section className="max-w-[760px] rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={createStudent} submitLabel="Opret elev" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Navn" name="fullName" required maxLength={80} />
            <TextField label="Telefonnummer" name="phone" type="tel" inputMode="tel" required placeholder="12 34 56 78" />
          </div>
          <StudentFields
            courses={courses}
            teams={teams}
            services={services ?? []}
            value={{ courseId: team?.courseId ?? undefined, teamId: team?.id ?? null }}
          />
        </ActionForm>
      </section>
    </>
  );
}
