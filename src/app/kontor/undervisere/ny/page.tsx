import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { CreateMemberForm } from "../create-member-form";

export default async function NewMemberPage({ searchParams }: PageProps<"/kontor/undervisere/ny">) {
  const { membership } = await requireRole(["admin", "office"]);
  const guest = (await searchParams).gaest === "1";

  return (
    <>
      <header>
        <Link href="/kontor/undervisere" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Alle undervisere og brugere
        </Link>
        <h1 className="mt-1 text-[30px] font-bold">{guest ? "Tilføj gæstelærer" : "Opret bruger"}</h1>
        <p className="text-muted">Telefonnummeret bliver både brugernavn og første kode. Ved første login vælger personen sin egen kode.</p>
      </header>
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <CreateMemberForm
          canGrantOffice={membership.role === "admin"}
          guest={guest}
        />
      </section>
    </>
  );
}
