import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateMemberForm } from "../create-member-form";

export default async function NewMemberPage({ searchParams }: PageProps<"/kontor/undervisere/ny">) {
  const { membership } = await requireRole(["admin", "office"]);
  const guest = (await searchParams).gaest === "1";
  const supabase = await createClient();

  const [{ data: categories }, { data: lessonTypes }] = await Promise.all([
    supabase.from("license_categories").select("code").order("sort_order"),
    supabase
      .from("lesson_types")
      .select("id, name")
      .eq("school_id", membership.schoolId)
      .eq("active", true)
      .order("sort_order"),
  ]);

  return (
    <>
      <header>
        <Link href="/kontor/undervisere" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Alle undervisere og brugere
        </Link>
        <h1 className="mt-1 text-[30px] font-bold">{guest ? "Tilføj gæstelærer" : "Opret bruger"}</h1>
        <p className="text-muted">Telefonnummeret bliver brugernavn. Personen får en midlertidig kode.</p>
      </header>
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <CreateMemberForm
          canGrantOffice={membership.role === "admin"}
          guest={guest}
          categories={(categories ?? []).map((c) => ({ value: c.code, label: c.code }))}
          lessonTypes={(lessonTypes ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
      </section>
    </>
  );
}
