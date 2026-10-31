import Link from "next/link";
import { ActionForm, TextField } from "@/components/form";
import { requirePlatformOwner } from "@/lib/auth/session";
import { createSchool } from "../actions";

export const metadata = { title: "Ny skole · Vixx" };

export default async function NewSchoolPage() {
  await requirePlatformOwner();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-5 p-[clamp(16px,4vw,44px)]">
      <header className="flex flex-col gap-1">
        <Link href="/platform" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Alle skoler
        </Link>
        <h1 className="text-[30px] font-bold">Ny skole</h1>
        <p className="text-muted">Skolen får standardtyperne. Skolens admin opretter selv resten.</p>
      </header>
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={createSchool} submitLabel="Opret skole" pendingLabel="Opretter …" className="flex flex-col gap-5">
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-bold">Skolen</legend>
            <TextField label="Navn" name="schoolName" required maxLength={80} className="sm:col-span-3" />
            <TextField label="Lektionslængde (min.)" name="lessonMinutes" type="number" min={15} max={240} defaultValue={45} required />
            <TextField label="Lønperioden starter den" name="payPeriodStartDay" type="number" min={1} max={28} defaultValue={21} required />
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">Skolens første admin</legend>
            <TextField label="Navn" name="adminName" required maxLength={80} />
            <TextField label="Telefonnummer" name="adminPhone" type="tel" required placeholder="12 34 56 78" hint="Bliver brugernavn ved login." />
          </fieldset>
        </ActionForm>
      </section>
    </main>
  );
}
