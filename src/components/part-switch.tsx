import Link from "next/link";

// Skifter mellem kontoret og lærer-appen for personer med begge roller.
export function PartSwitch({ current, className = "" }: { current: "kontor" | "laerer"; className?: string }) {
  const item = (part: "kontor" | "laerer", label: string) => (
    <Link
      href={`/${part}`}
      aria-current={current === part ? "page" : undefined}
      className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-bold ${
        current === part ? "bg-accent text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Skift mellem kontor og lærer" className={`flex rounded-[10px] border border-line2 bg-surface p-0.5 ${className}`}>
      {item("kontor", "Kontor")}
      {item("laerer", "Lærer")}
    </nav>
  );
}
