import type { ReactNode } from "react";
import { LogoMark } from "./logo-mark";

// Fælles ramme til fejlsider: lille kort midt på siden.
export function ErrorCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-5">
      <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-line bg-surface p-6">
        <LogoMark />
        <h1 className="text-2xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
