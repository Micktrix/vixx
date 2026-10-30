import Link from "next/link";
import { icons } from "@/components/icons";
import { signOut } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { ComingSoon, Screen } from "../screen";

export default async function InstructorMessagesPage() {
  const { user, membership } = await requireRole(["instructor"]);

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
        <div className="flex justify-between gap-3">
          <span className="text-muted">Logget ind som</span>
          <b>{user.fullName}</b>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Telefon</span>
          <span>{formatPhone(user.phone)}</span>
        </div>
        {user.memberships.length > 1 && (
          <Link href="/vaelg-skole" className="font-semibold text-accent-ink underline underline-offset-[3px]">
            Skift skole
          </Link>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line2 bg-surface text-[15px] font-semibold"
          >
            {icons.logout} Log ud
          </button>
        </form>
      </section>
    </Screen>
  );
}
