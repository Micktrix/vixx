import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";

// Tom forside. Erstattes af login i trin 2.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <LogoMark />
        <div>
          <p className="text-[13px] text-muted">Vixx</p>
          <h1 className="text-2xl font-bold">Timeregistrering</h1>
        </div>
      </div>
      <div className="flex gap-3">
        <Link
          href="/kontor"
          className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
        >
          Kontor
        </Link>
        <Link
          href="/laerer"
          className="inline-flex h-11 items-center rounded-xl border border-line2 bg-surface px-4 text-[15px] font-semibold"
        >
          Lærer
        </Link>
      </div>
    </main>
  );
}
