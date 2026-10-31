"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { icons } from "@/components/icons";
import { LogoMark } from "@/components/logo-mark";
import { PartSwitch } from "@/components/part-switch";
import { signOut } from "@/lib/auth/actions";
import { officeHref, officeSections } from "./sections";

type Props = { schoolName: string; userName: string; canSwitchSchool: boolean; teaches: boolean };

export function OfficeSidebar({ schoolName, userName, canSwitchSchool, teaches }: Props) {
  const pathname = usePathname();

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
        {teaches && <PartSwitch current="kontor" className="w-full min-[860px]:mb-3" />}
        {officeSections.map((s) => {
          const href = officeHref(s);
          const current = s.slug ? pathname.startsWith(href) : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[15px] whitespace-nowrap min-[860px]:gap-3.5 ${
                current
                  ? "bg-accent-bg font-bold text-accent-ink"
                  : "font-medium text-muted hover:bg-soft"
              }`}
            >
              <span className="hidden min-[860px]:inline-flex">{icons[s.icon]}</span>
              {s.label}
            </Link>
          );
        })}
        <div className="flex items-center gap-2 px-3 py-2.5 text-[15px] min-[860px]:mt-auto min-[860px]:flex-col min-[860px]:items-start min-[860px]:gap-1 min-[860px]:border-t min-[860px]:border-line min-[860px]:pt-4">
          <span className="hidden text-[13px] text-muted min-[860px]:block">Logget ind som {userName}</span>
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
