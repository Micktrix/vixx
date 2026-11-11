import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { signOut } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/login-identity";
import { getCurrentUser } from "@/lib/auth/session";
import { NewPasswordForm } from "./new-password-form";

export default async function NewPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.mustChangePassword) redirect("/");

  return (
    <AuthShell caption={`Hej ${user.fullName.split(" ")[0]}`} title="Vælg din egen kode">
      <p>
        Du er logget ind med dit telefonnummer som kode. Vælg en kode på mindst {MIN_PASSWORD_LENGTH} tegn, som kun du kender.
      </p>
      <NewPasswordForm />
      <form action={signOut}>
        <button type="submit" className="font-semibold text-accent-ink underline underline-offset-[3px]">
          Log ud
        </button>
      </form>
    </AuthShell>
  );
}
