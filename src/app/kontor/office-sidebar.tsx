"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { icons } from "@/components/icons";
import { LogoMark } from "@/components/logo-mark";
import { PartSwitch } from "@/components/part-switch";
import { signOut } from "@/lib/auth/actions";
import { officeHref, officeSections, type OfficeSection } from "./sections";

type Props = {
  schoolName: string;
  userName: string;
  canSwitchSchool: boolean;
  teaches: boolean;
  isAdmin: boolean;
  badges: Record<string, number>; // antal der venter pr. menupunkt (slug)
  isPlatformOwner: boolean;
};

const itemClass = (current: boolean) =>
  `flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-[15px] whitespace-nowrap min-[860px]:gap-3.5 ${
    current ? "bg-accent-bg font-bold text-accent-ink" : "font-medium text-muted hover:bg-soft"
  }`;

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} venter`}
      className="ml-auto min-w-[22px] rounded-full bg-accent px-1.5 text-center text-[12px] leading-[22px] font-bold text-ink"
    >
      {count}
    </span>
  );
}

export function OfficeSidebar({ schoolName, userName, canSwitchSchool, teaches, isAdmin, badges, isPlatformOwner }: Props) {
  const pathname = usePathname();
  const isCurrent = (s: OfficeSection) => {
    const href = officeHref(s);
    return s.slug ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;
  };
  // Undermenuen er åben, når man er på en af dens sider, og kan åbnes/lukkes med et klik.
  const inGroup = (s: OfficeSection) => !!s.children?.some(isCurrent);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav
      aria-label="Kontormenu"
      className="border-b border-line bg-surface min-[860px]:sticky min-[860px]:top-0 min-[860px]:h-screen min-[860px]:w-60 min-[860px]:shrink-0 min-[860px]:border-r min-[860px]:border-b-0"
    >
      <div className="flex flex-row flex-wrap gap-1 p-2.5 min-[860px]:h-full min-[860px]:flex-col min-[860px]:flex-nowrap min-[860px]:overflow-y-auto min-[860px]:px-3 min-[860px]:py-5">
        <div className="hidden items-center gap-3 px-2 pb-5 min-[860px]:flex">
          <LogoMark />
          <div className="min-w-0">
            <b className="block text-[15px]">Timeregistrering</b>
            <span className="text-[13px] text-muted">{schoolName}</span>
          </div>
        </div>
        {(teaches || isAdmin) && <PartSwitch teaches={teaches} demo={isAdmin} className="w-full min-[860px]:mb-3" />}
        {officeSections.map((s) => {
          if (!s.children) {
            const current = isCurrent(s);
            return (
              <Link key={s.label} href={officeHref(s)} aria-current={current ? "page" : undefined} className={`${itemClass(current)} w-auto min-[860px]:w-full`}>
                <span className="hidden min-[860px]:inline-flex">{icons[s.icon]}</span>
                {s.label}
                {s.slug && <Badge count={badges[s.slug] ?? 0} />}
              </Link>
            );
          }

          const expanded = open[s.label] ?? inGroup(s);
          const groupBadge = s.children.reduce((n, c) => n + (c.slug ? (badges[c.slug] ?? 0) : 0), 0);
          return (
            <div key={s.label} className="flex flex-col gap-1 max-[859px]:contents">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen((o) => ({ ...o, [s.label]: !expanded }))}
                className={`${itemClass(false)} w-auto min-[860px]:w-full ${inGroup(s) ? "text-ink" : ""}`}
              >
                <span className="hidden min-[860px]:inline-flex">{icons[s.icon]}</span>
                {s.label}
                {!expanded && <Badge count={groupBadge} />}
                <span aria-hidden="true" className={`ml-auto text-[12px] transition-transform ${expanded ? "rotate-90" : ""} ${!expanded && groupBadge ? "ml-1" : ""}`}>
                  ›
                </span>
              </button>
              {expanded &&
                s.children.map((c) => {
                  const current = isCurrent(c);
                  return (
                    <Link
                      key={c.label}
                      href={officeHref(c)}
                      aria-current={current ? "page" : undefined}
                      className={`${itemClass(current)} w-auto min-[860px]:w-full min-[860px]:pl-11`}
                    >
                      {c.label}
                      {c.slug && <Badge count={badges[c.slug] ?? 0} />}
                    </Link>
                  );
                })}
            </div>
          );
        })}
        <div className="flex items-center gap-2 px-3 py-2.5 text-[15px] min-[860px]:mt-auto min-[860px]:flex-col min-[860px]:items-start min-[860px]:gap-1 min-[860px]:border-t min-[860px]:border-line min-[860px]:pt-4">
          <span className="hidden text-[13px] text-muted min-[860px]:block">Logget ind som {userName}</span>
          {isPlatformOwner && (
            <Link href="/platform" className="font-medium text-muted hover:text-ink">
              Platform (alle skoler)
            </Link>
          )}
          {canSwitchSchool && (
            <Link href="/vaelg-skole" className="font-medium text-muted hover:text-ink">
              Skift skole
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="flex items-center gap-2 font-medium text-muted hover:text-ink">
              {icons.logout}
              Log ud
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
