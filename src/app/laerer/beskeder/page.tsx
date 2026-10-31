import Link from "next/link";
import { ActionForm } from "@/components/form";
import { icons } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import { markMessagesRead } from "../self-service-actions";
import { signOut } from "@/lib/auth/actions";
import { isStaff, requireRole } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../screen";

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

  // Beskeder til alle og til læreren selv (RLS). Afsendelse fra kontoret kommer i trin 9.
  const [{ data: messages }, { data: reads }] = await Promise.all([
    supabase.from("messages").select("id, body, created_at").eq("school_id", membership.schoolId).order("created_at", { ascending: false }).limit(50),
    supabase.from("message_reads").select("message_id").eq("user_id", user.id),
  ]);
  const readIds = new Set((reads ?? []).map((r) => r.message_id));
  const unread = (messages ?? []).filter((m) => !readIds.has(m.id));

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
      <section className="flex flex-col gap-2">
        {(messages ?? []).map((m) => (
          <article
            key={m.id}
            className={`rounded-[16px] border px-4 py-3 ${readIds.has(m.id) ? "border-line bg-surface" : "border-accent-line bg-accent-bg"}`}
            data-testid="message"
          >
            <p className="whitespace-pre-line">{m.body}</p>
            <p className="mt-1 text-[12px] text-muted">
              {formatDate(m.created_at.slice(0, 10))}
              {!readIds.has(m.id) && " · Ny"}
            </p>
          </article>
        ))}
        {!messages?.length && (
          <p className="rounded-[16px] border border-line bg-surface px-4 py-3 text-sm text-muted">
            Ingen beskeder. Når kontoret skriver til dig, kan du se det her.
          </p>
        )}
        {unread.length > 0 && (
          <ActionForm action={markMessagesRead} submitLabel="Markér som læst" pendingLabel="…" primary={false}>
            {unread.map((m) => (
              <input key={m.id} type="hidden" name="messageId" value={m.id} />
            ))}
          </ActionForm>
        )}
      </section>
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
