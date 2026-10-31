"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const timeFormat = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

// Ur og "nu"-linje, der går af sig selv, og som henter nye data hvert minut.
export function LiveClock() {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const clock = setInterval(tick, 15_000);
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [router]);
  return <span className="tabular-nums">{now ? timeFormat.format(now) : ""}</span>;
}

export function NowLine({ from, to }: { from: number; to: number }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const [h, m] = timeFormat.format(new Date()).split(/[.:]/).map(Number);
      setMinutes(h * 60 + m);
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  if (minutes === null || minutes < from || minutes > to) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-accent"
      style={{ left: `${((minutes - from) / (to - from)) * 100}%` }}
    />
  );
}
