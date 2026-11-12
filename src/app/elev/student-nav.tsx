"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { icons } from "@/components/icons";

const tabs = [
  { href: "/elev/kalender", label: "Kalender", icon: icons.calendar },
  { href: "/elev", label: "Forløb", icon: icons.list },
  { href: "/elev/qr", label: "QR-kode", icon: icons.scan },
  { href: "/elev/mere", label: "Mere", icon: icons.user },
];

export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Elevmenu"
      className="box-content flex h-[70px] shrink-0 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => {
        const current = t.href === "/elev" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={`flex min-w-[64px] flex-col items-center gap-1 text-xs ${current ? "font-bold text-accent-ink" : "font-semibold text-muted"}`}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
