"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Skifter mellem kontoret, lærer-appen og (for admin) demo-eleven, der viser elevens skærm.
export function PartSwitch({ teaches, demo, className = "" }: { teaches: boolean; demo: boolean; className?: string }) {
  const pathname = usePathname();
  const current = pathname.startsWith("/kontor/demo-elev") ? "elev" : pathname.startsWith("/laerer") ? "laerer" : "kontor";
  const item = (part: "kontor" | "laerer" | "elev", href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === part ? "page" : undefined}
      className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-bold ${
        current === part ? "bg-accent text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Skift mellem kontor, lærer og elev" className={`flex rounded-[10px] border border-line2 bg-surface p-0.5 ${className}`}>
      {item("kontor", "/kontor", "Kontor")}
      {teaches && item("laerer", "/laerer", "Lærer")}
      {demo && item("elev", "/kontor/demo-elev", "Elev")}
    </nav>
  );
}
