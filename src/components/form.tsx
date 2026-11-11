"use client";

import Link from "next/link";
import { useActionState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionState, FormAction } from "@/lib/action-state";
import { buttonClass, inputClass, primaryButtonClass } from "./styles";

// Kalder en serverhandling fra en formular. React nulstiller ellers formularen efter en
// <form action>, så det, brugeren har skrevet, forsvinder ved en fejl. Det undgår vi her.
export function useFormAction(action: FormAction, confirmText?: string) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirmText && !confirm(confirmText)) return;
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(data));
  };
  return { state, onSubmit, pending };
}

// Formular, der kalder en serverhandling og viser svaret under knappen.
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Gemmer …",
  confirmText,
  primary = true,
  className = "flex flex-col gap-3",
  children,
}: {
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  confirmText?: string;
  primary?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { state, onSubmit, pending } = useFormAction(action, confirmText);

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <div>
        <button type="submit" disabled={pending} className={primary ? primaryButtonClass : buttonClass}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}

export function ResultBox({ state }: { state: ActionState }) {
  if (!state) return null;
  if ("error" in state) {
    return <p role="alert" className="text-sm font-semibold text-bad">{state.error}</p>;
  }
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-xl border border-accent-line bg-accent-bg px-3.5 py-3 text-sm">
      <p>{state.message}</p>
      {state.tempPassword && (
        <p>
          Første kode:{" "}
          <code data-testid="temp-password" className="rounded-md bg-surface px-2 py-0.5 font-mono text-base font-bold tracking-wider">
            {state.tempPassword}
          </code>
        </p>
      )}
      {state.href && (
        <Link href={state.href} className="font-semibold text-accent-ink underline underline-offset-[3px]">
          {state.hrefLabel ?? "Videre"}
        </Link>
      )}
    </div>
  );
}

export function TextField({
  label,
  name,
  hint,
  className,
  ...input
}: { label: string; name: string; hint?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-bold ${className ?? ""}`}>
      {label}
      <input name={name} className={inputClass} {...input} />
      {hint && <span className="text-[13px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

// Afkrydsning (eller ét valg ud af flere med type="radio") vist som en "chip", som i prototypen.
export function CheckChip({
  name,
  value,
  label,
  defaultChecked,
  disabled,
  required,
  type = "checkbox",
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  type?: "checkbox" | "radio";
}) {
  return (
    <label className="cursor-pointer has-disabled:cursor-default has-disabled:opacity-60">
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        required={required}
        className="peer sr-only"
      />
      <span className="inline-flex h-9 items-center rounded-full border border-line2 bg-surface px-3.5 text-sm font-semibold text-muted peer-checked:border-accent peer-checked:bg-accent-bg peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
        {label}
      </span>
    </label>
  );
}

export function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </fieldset>
  );
}
