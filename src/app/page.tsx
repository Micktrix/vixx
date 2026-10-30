import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser, homePath } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(await homePath(user));

  return (
    <AuthShell caption="Vixx" title="Timeregistrering">
      <h1 className="text-[22px] font-bold">Log ind</h1>
      <LoginForm />
      <p className="text-[13.5px] text-muted">Første gang? Brug koden fra kontoret. Derefter vælger du din egen kode.</p>
      <p className="text-[13.5px] text-muted">Glemt kode? Kontakt kontoret.</p>
    </AuthShell>
  );
}
