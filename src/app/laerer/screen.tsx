import type { ReactNode } from "react";

export function Screen({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <>
      <header className="px-5 pt-[calc(22px+env(safe-area-inset-top))] pb-3">
        <p className="text-[13px] text-muted">{sub}</p>
        <h1 className="text-2xl font-bold">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 pb-5">{children}</div>
    </>
  );
}

export function ComingSoon({ step }: { step: string }) {
  return (
    <section className="rounded-[20px] border border-line bg-surface p-[18px]">
      <p className="text-muted">Denne side bygges i {step}.</p>
    </section>
  );
}
