import Link from "next/link";
import { ErrorCard } from "@/components/error-card";

export default function NotFound() {
  return (
    <ErrorCard title="Siden findes ikke">
      <p className="text-muted">Linket er måske forkert, eller det, du leder efter, er slettet.</p>
      <Link href="/" className="font-semibold text-accent-ink underline underline-offset-[3px]">
        Gå til forsiden
      </Link>
    </ErrorCard>
  );
}
