"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Henter siden igen med jævne mellemrum, så en kvittering fra lærerens telefon dukker op af sig selv.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
