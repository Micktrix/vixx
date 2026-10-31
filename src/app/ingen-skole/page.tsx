import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

export default async function NoSchoolPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.memberships.length > 0 || user.isPlatformOwner) redirect("/");

  return (
    <AuthShell caption={`Hej ${user.fullName.split(" ")[0]}`} title="Ingen adgang">
      <p>Din bruger er ikke tilknyttet en køreskole lige nu. Kontakt kontoret.</p>
      <form action={signOut}>
        <button type="submit" className="font-semibold text-accent-ink underline underline-offset-[3px]">
          Log ud
        </button>
      </form>
    </AuthShell>
  );
}
