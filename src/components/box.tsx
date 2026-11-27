import type { ReactNode } from "react";

// Hvid boks med overskrift, som kontorets sektioner i prototypen. `collapsible`: boksen kan foldes sammen (fx på
// elevens side, så den ikke bliver lang og uoverskuelig); overskrift og hint ses altid.
export function Box({
  title,
  hint,
  children,
  collapsible = false,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const head = (
    <>
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </>
  );
  if (collapsible)
    return (
      <details open={defaultOpen || undefined} data-box="" className="group rounded-[20px] border border-line bg-surface p-[18px]">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="flex items-baseline gap-2">
            <span className="inline-block text-muted transition-transform group-open:rotate-90">›</span>
            <h2 className="text-lg font-bold">{title}</h2>
          </span>
          {hint && <span className="text-[13px] text-muted">{hint}</span>}
        </summary>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </details>
    );
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">{head}</div>
      {children}
    </section>
  );
}
