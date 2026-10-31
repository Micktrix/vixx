import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { Pill } from "@/components/pill";
import { signOut } from "@/lib/auth/actions";
import { requirePlatformOwner } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { joinSchool, openSchool } from "./actions";

export const metadata = { title: "Platform · Vixx" };

type SchoolRow = {
  id: string;
  name: string;
  created_at: string;
  school_members: { role: "admin" | "office" | "instructor"; active: boolean }[];
};

const button = "inline-flex h-9 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold";

// Platform-ejerens oversigt: alle skoler, opret ny skole, gå ind på en skole.
export default async function PlatformPage() {
  const user = await requirePlatformOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("schools")
    .select("id, name, created_at, school_members(role, active)")
    .order("name");
  const schools = (data ?? []) as unknown as SchoolRow[];
  const count = (s: SchoolRow, role: string) => s.school_members.filter((m) => m.active && m.role === role).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1000px] flex-col gap-5 p-[clamp(16px,4vw,44px)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-sm text-muted">Platform · {user.fullName}</p>
            <h1 className="text-[30px] font-bold">Skoler</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/platform/ny"
            className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
          >
            + Ny skole
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm font-semibold text-muted hover:text-ink">
              Log ud
            </button>
          </form>
        </div>
      </header>

      <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead className="text-[13px] text-muted">
            <tr>
              <th className="py-2.5 pr-3 pl-[18px] font-semibold">Skole</th>
              <th className="px-3 py-2.5 text-right font-semibold">Admin</th>
              <th className="px-3 py-2.5 text-right font-semibold">Kontor</th>
              <th className="px-3 py-2.5 text-right font-semibold">Lærere</th>
              <th className="px-3 py-2.5 font-semibold">Oprettet</th>
              <th className="py-2.5 pr-[18px] pl-3" />
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => {
              const mine = user.memberships.find((m) => m.schoolId === s.id);
              return (
                <tr key={s.id} className="border-t border-line" data-testid="school-row">
                  <td className="py-3 pr-3 pl-[18px]">
                    <b>{s.name}</b>
                    {mine && (
                      <span className="ml-2">
                        <Pill>Du er {mine.role === "admin" ? "admin" : mine.role === "office" ? "kontor" : "lærer"}</Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{count(s, "admin")}</td>
                  <td className="px-3 py-3 text-right">{count(s, "office")}</td>
                  <td className="px-3 py-3 text-right">{count(s, "instructor")}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(s.created_at.slice(0, 10))}</td>
                  <td className="py-3 pr-[18px] pl-3 text-right">
                    {mine && mine.role !== "instructor" ? (
                      <form action={openSchool}>
                        <input type="hidden" name="schoolId" value={s.id} />
                        <button type="submit" className={button}>
                          Åbn
                        </button>
                      </form>
                    ) : (
                      <form action={joinSchool}>
                        <input type="hidden" name="schoolId" value={s.id} />
                        <button type="submit" className={button} title="Du bliver admin på skolen. Det kan ses af skolen og står i ændringsloggen.">
                          Gå ind som admin
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!schools.length && (
              <tr>
                <td colSpan={6} className="px-[18px] py-4 text-muted">
                  Ingen skoler endnu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-[13px] text-muted">
        &quot;Gå ind som admin&quot; gør dig til admin på skolen, så du kan hjælpe. Det kan ses under skolens undervisere og står i
        ændringsloggen. Du kan fjerne dig selv igen ved at blive deaktiveret af skolens admin.
      </p>
    </main>
  );
}
