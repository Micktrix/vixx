import type { ReactNode } from "react";

// Hvid boks med overskrift, som kontorets sektioner i prototypen.
export function Box({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
