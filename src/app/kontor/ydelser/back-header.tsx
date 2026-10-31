import Link from "next/link";
import type { ReactNode } from "react";

export function BackHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <Link href="/kontor/ydelser" className="text-sm font-semibold text-muted hover:text-ink">
        ‹ Ydelser og satser
      </Link>
      <h1 className="text-[30px] font-bold">{title}</h1>
      {children}
    </header>
  );
}
