"use client";

import { useActionState } from "react";
import { ErrorText, Field, PrimaryButton } from "@/components/auth-shell";
import { signIn } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <Field id="phone" label="Telefonnummer" type="tel" autoComplete="username" placeholder="12 34 56 78" required />
      <Field id="password" label="Kode" type="password" autoComplete="current-password" required />
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <PrimaryButton pending={pending}>{pending ? "Logger ind …" : "Log ind"}</PrimaryButton>
    </form>
  );
}
