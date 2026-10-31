import Link from "next/link";
import { icons } from "@/components/icons";
import { signOut } from "@/lib/auth/actions";
import { isStaff, requireRole } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { ComingSoon, Screen } from "../screen";

const linkButton =
  "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line2 bg-surface text-[15px] font-semibold";

export default async function InstructorMessagesPage() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("instructors")
    .select("address, postal_code, city, next_of_kin_name, next_of_kin_relation")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .single();

  const address = [me?.address, [me?.postal_code, me?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const kin = me?.next_of_kin_name
    ? me.next_of_kin_name + (me.next_of_kin_relation ? ` (${me.next_of_kin_relation})` : "")
    : "";

  const logout = (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="Log ud"
        className="inline-flex size-[42px] items-center justify-center rounded-xl border border-line bg-surface"
      >
        {icons.logout}
      </button>
    </form>
  );

  return (
    <Screen title="Beskeder" sub={membership.schoolName} action={logout}>
      <ComingSoon step="trin 9" />
      <section className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-[18px] text-[15px]">
        <Row label="Logget ind som" value={<b>{user.fullName}</b>} />
        <Row label="Telefon" value={formatPhone(user.phone)} />
        <Row label="Adresse" value={address || "–"} />
        <Row label="Pårørende" value={kin || "–"} />
        <Link href="/laerer/oplysninger" className={linkButton}>
          Ret mine oplysninger
        </Link>
        {isStaff(membership) && (
          <Link href="/kontor" className={linkButton}>
            Skift til kontoret
          </Link>
        )}
        {user.memberships.length > 1 && (
          <Link href="/vaelg-skole" className="font-semibold text-accent-ink underline underline-offset-[3px]">
            Skift skole
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className={linkButton}>
            {icons.logout} Log ud
          </button>
        </form>
      </section>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
