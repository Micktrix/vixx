import type { ReactNode } from "react";

export function Screen({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-3 px-5 pt-[calc(22px+env(safe-area-inset-top))] pb-3">
        <div>
          <p className="text-[13px] text-muted">{sub}</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 pb-5">{children}</div>
    </>
  );
}
