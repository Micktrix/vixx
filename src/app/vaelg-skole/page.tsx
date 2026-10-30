import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { chooseSchool, signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

const roleLabel = { admin: "Admin", office: "Kontor", instructor: "Lærer" } as const;

export default async function ChooseSchoolPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.mustChangePassword) redirect("/ny-kode");

  return (
    <AuthShell caption={`Hej ${user.fullName.split(" ")[0]}`} title="Vælg køreskole">
      <p>Du er tilknyttet flere køreskoler. Hvor vil du arbejde nu?</p>
      {user.memberships.map((m) => (
        <form key={m.schoolId} action={chooseSchool}>
          <input type="hidden" name="schoolId" value={m.schoolId} />
          <button
            type="submit"
            className="flex w-full items-center justify-between rounded-xl border border-line bg-bg px-3 py-2.5 text-left text-[15px]"
          >
            <b>{m.schoolName}</b>
            <span className="text-muted">{roleLabel[m.role]}</span>
          </button>
        </form>
      ))}
      <form action={signOut}>
        <button type="submit" className="font-semibold text-accent-ink underline underline-offset-[3px]">
          Log ud
        </button>
      </form>
    </AuthShell>
  );
}
