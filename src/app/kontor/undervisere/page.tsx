import Link from "next/link";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { PERSON_SELECT, toPerson, type Person, type PersonRow } from "./people";

const roleOrder = (p: Person) => (p.role === "admin" ? 0 : p.role === "office" ? 1 : 2);

export default async function OfficeInstructorsPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();

  const [{ data }, { data: cats }] = await Promise.all([
    supabase.from("school_members").select(PERSON_SELECT).eq("school_id", membership.schoolId),
    supabase.from("license_categories").select("code, sort_order"),
  ]);

  const catOrder = new Map((cats ?? []).map((c) => [c.code, c.sort_order]));
  const people = ((data ?? []) as unknown as PersonRow[])
    .map((row) => toPerson(row))
    .map((p) => ({ ...p, categories: p.categories.sort((a, b) => (catOrder.get(a) ?? 0) - (catOrder.get(b) ?? 0)) }))
    .sort((a, b) => roleOrder(a) - roleOrder(b) || a.name.localeCompare(b.name, "da"));

  const active = people.filter((p) => p.memberActive);
  const inactive = people.filter((p) => !p.memberActive);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Undervisere og brugere</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/kontor/undervisere/ny?gaest=1"
            className="inline-flex h-11 items-center rounded-xl border border-line2 bg-surface px-4 text-[15px] font-semibold"
          >
            + Tilføj gæstelærer
          </Link>
          <Link
            href="/kontor/undervisere/ny"
            className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
          >
            + Opret bruger
          </Link>
        </div>
      </header>

      <PeopleTable title="Aktive" people={active} />
      {inactive.length > 0 && <PeopleTable title="Deaktiverede" people={inactive} />}
    </>
  );
}

function PeopleTable({ title, people }: { title: string; people: Person[] }) {
  return (
    <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
      <h2 className="border-b border-line px-[18px] py-3.5 text-lg font-bold">
        {title} <span className="text-base font-normal text-muted">({people.length})</span>
      </h2>
      <table className="w-full min-w-[680px] text-left text-[15px]">
        <thead className="text-[13px] text-muted">
          <tr>
            <th className="px-[18px] py-2.5 font-semibold">Navn</th>
            <th className="px-3 py-2.5 font-semibold">Telefon (brugernavn)</th>
            <th className="px-3 py-2.5 font-semibold">Roller</th>
            <th className="px-3 py-2.5 font-semibold">Kategorier</th>
            <th className="px-[18px] py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.userId} className="border-t border-line">
              <td className="px-[18px] py-3">
                <Link href={`/kontor/undervisere/${p.userId}`} className="font-bold hover:text-accent-ink hover:underline">
                  {p.name}
                </Link>
                {p.instructor?.is_guest && p.instructor.guest_company && (
                  <span className="block text-[13px] text-muted">{p.instructor.guest_company}</span>
                )}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{formatPhone(p.phone)}</td>
              <td className="px-3 py-3">
                <span className="flex flex-wrap gap-1">
                  {p.roles.map((r) => (
                    <Pill key={r}>{r}</Pill>
                  ))}
                  {p.instructor?.is_guest && p.teaches && <Pill>Gæst</Pill>}
                </span>
              </td>
              <td className="px-3 py-3">{p.teaches ? p.categories.join(", ") || "–" : ""}</td>
              <td className="px-[18px] py-3">
                <Pill tone={p.status.tone}>{p.status.label}</Pill>
              </td>
            </tr>
          ))}
          {people.length === 0 && (
            <tr>
              <td colSpan={5} className="px-[18px] py-4 text-muted">
                Ingen endnu.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
