"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { icons } from "@/components/icons";

export type StudentTab = "kalender" | "forloeb" | "qr" | "mere";

const APP: Record<StudentTab, string> = { kalender: "/elev/kalender", forloeb: "/elev", qr: "/elev/qr", mere: "/elev/mere" };
const tabs: { key: StudentTab; label: string; icon: React.ReactNode }[] = [
  { key: "kalender", label: "Kalender", icon: icons.calendar },
  { key: "forloeb", label: "Forløb", icon: icons.list },
  { key: "qr", label: "QR-kode", icon: icons.scan },
  { key: "mere", label: "Mere", icon: icons.user },
];

// Elevens bundmenu. Demo-eleven i kontoret giver sine egne links og den valgte fane.
export function StudentNav({ links = APP, current }: { links?: Record<StudentTab, string>; current?: StudentTab }) {
  const pathname = usePathname();
  const isCurrent = (key: StudentTab) =>
    current ? current === key : key === "forloeb" ? pathname === APP.forloeb : pathname.startsWith(APP[key]);
  return (
    <nav
      aria-label="Elevmenu"
      className="box-content flex h-[70px] shrink-0 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={links[t.key]}
          aria-current={isCurrent(t.key) ? "page" : undefined}
          className={`flex min-w-[64px] flex-col items-center gap-1 text-xs ${isCurrent(t.key) ? "font-bold text-accent-ink" : "font-semibold text-muted"}`}
        >
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
