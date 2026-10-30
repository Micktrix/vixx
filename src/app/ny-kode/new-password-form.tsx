"use client";

import { useActionState } from "react";
import { ErrorText, Field, PrimaryButton } from "@/components/auth-shell";
import { changePassword } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/login-identity";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <Field id="password" label="Ny kode" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      <Field id="repeat" label="Gentag kode" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <PrimaryButton pending={pending}>{pending ? "Gemmer …" : "Gem kode"}</PrimaryButton>
    </form>
  );
}
