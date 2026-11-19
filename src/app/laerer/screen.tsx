import Link from "next/link";
import type { ReactNode } from "react";

export function Screen({
  title,
  sub,
  action,
  back,
  children,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
  back?: { href: string; label: string }; // "‹ Kalender" øverst til venstre
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-3 px-5 pt-[calc(22px+env(safe-area-inset-top))] pb-3 group-data-[switch]/frame:pt-4">
        <div>
          {back && (
            <Link href={back.href} className="mb-1 inline-block text-sm font-semibold text-accent-ink">
              ‹ {back.label}
            </Link>
          )}
          <p className="text-[13px] text-muted">{sub}</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-5 pb-5">{children}</div>
    </>
  );
}
