import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Siden findes ikke</h1>
      <p className="text-muted">Tjek adressen, eller gå til forsiden.</p>
      <Link href="/" className="font-semibold text-accent-ink underline underline-offset-[3px]">
        Til forsiden
      </Link>
    </main>
  );
}
