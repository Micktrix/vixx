import { requireRole, type Role } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { CreateMemberForm } from "./create-member-form";
import { MemberActions } from "./member-actions";

const roleLabel: Record<Role, string> = { admin: "Admin", office: "Kontor", instructor: "Lærer" };
const roleOrder: Record<Role, number> = { admin: 0, office: 1, instructor: 2 };

type Row = {
  user_id: string;
  role: Role;
  profiles: { full_name: string; phone: string; must_change_password: boolean } | null;
};

// Trin 2: brugere og login. Den fulde underviser-side (stamdata, kompetencer, priser) kommer i trin 3.
export default async function OfficeInstructorsPage() {
  const { user, membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("school_members")
    .select("user_id, role, profiles(full_name, phone, must_change_password)")
    .eq("school_id", membership.schoolId)
    .eq("active", true);

  const rows = ((data ?? []) as unknown as Row[]).sort(
    (a, b) =>
      roleOrder[a.role] - roleOrder[b.role] ||
      (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? "", "da"),
  );
  const isAdmin = membership.role === "admin";

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Undervisere og brugere</h1>
      </header>

      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 className="text-lg font-bold">Opret bruger</h2>
        <CreateMemberForm canCreateStaff={isAdmin} />
      </section>

      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 className="mb-3 text-lg font-bold">Brugere på skolen</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.user_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.profiles?.full_name}{" "}
                  <span className="ml-1 rounded-full bg-pend-bg px-2 py-0.5 text-xs font-bold text-pend">
                    {roleLabel[r.role]}
                  </span>
                  {r.profiles?.must_change_password && (
                    <span className="ml-1 rounded-full bg-accent-bg px-2 py-0.5 text-xs font-bold text-accent-ink">
                      Midlertidig kode
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted">{r.profiles ? formatPhone(r.profiles.phone) : ""}</p>
              </div>
              {r.user_id !== user.id && (isAdmin || r.role === "instructor") && (
                <MemberActions userId={r.user_id} name={r.profiles?.full_name ?? ""} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
