"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { icons } from "@/components/icons";

const tabs = [
  { href: "/laerer", label: "Kalender", icon: icons.calendar },
  { href: "/laerer/overblik", label: "Overblik", icon: icons.chart },
  { href: "/laerer/beskeder", label: "Beskeder", icon: icons.message },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Lærermenu"
      className="flex h-[70px] shrink-0 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] box-content"
    >
      {tabs.map((t) => {
        const current = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={`flex min-w-[72px] flex-col items-center gap-1 text-xs ${
              current ? "font-bold text-accent-ink" : "font-semibold text-muted"
            }`}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
