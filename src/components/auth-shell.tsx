import type { ReactNode } from "react";
import { LogoMark } from "./logo-mark";

// Rammen om login og "Vælg din egen kode", som i prototypen.
export function AuthShell({ caption, title, children }: { caption: string; title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 justify-center sm:p-5">
      <div className="flex w-full flex-col overflow-auto bg-bg sm:max-w-[400px] sm:rounded-[36px] sm:border sm:border-line sm:shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]">
        <div className="flex flex-col gap-1.5 border-b border-line bg-surface px-6 pt-[calc(36px+env(safe-area-inset-top))] pb-[52px]">
          <LogoMark />
          <p className="mt-2.5 text-sm text-muted">{caption}</p>
          <p className="text-[26px] font-bold">{title}</p>
        </div>
        <div className="mx-3.5 -mt-7 mb-6 flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface px-[18px] pt-[22px] pb-6">
          {children}
        </div>
      </div>
    </main>
  );
}

export function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <input
        id={id}
        name={id}
        className="h-[50px] w-full rounded-[10px] border border-line2 bg-surface px-3 text-[17px]"
        {...input}
      />
      {hint && <p className="text-[13.5px] text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-sm font-semibold text-bad">{children}</p>;
}

export function PrimaryButton({ children, pending }: { children: ReactNode; pending?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-[52px] w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-base font-bold text-ink disabled:opacity-60"
    >
      {children}
    </button>
  );
}
