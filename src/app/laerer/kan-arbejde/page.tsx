import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, CheckChip } from "@/components/form";
import { inputClass } from "@/components/styles";
import { addDays, formatMonth, parseDateInput, todayDk, weekdayIndex } from "@/lib/dates";
import { TIME_SLOTS } from "@/lib/schedule";
import { saveCanWork } from "../self-service-actions";
import { Screen } from "../screen";
import { getTeacher } from "../teacher-data";

const WEEKDAYS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

// Vælg de datoer, du kan arbejde, og tidsrummet. Kun for undervisere på "Efter aftale".
export default async function CanWorkPage({ searchParams }: PageProps<"/laerer/kan-arbejde">) {
  const teacher = await getTeacher();
  if (!teacher.onRequest) redirect("/laerer");
  const sp = await searchParams;
  const today = todayDk();
  const chosen = parseDateInput(typeof sp.dato === "string" ? sp.dato : "") ?? today;

  // Seks uger frem fra mandagen i denne uge.
  const first = addDays(today, -weekdayIndex(today));
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));

  return (
    <Screen
      title="Jeg kan arbejde"
      sub="Vælg de datoer, du kan arbejde"
      action={
        <Link href={`/laerer?dag=${chosen}`} className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={saveCanWork} submitLabel="Gem" className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold">
              Datoer · {formatMonth(today)}
              {days.at(-1)!.slice(0, 7) !== today.slice(0, 7) ? ` – ${formatMonth(days.at(-1)!)}` : ""}
            </legend>
            <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-muted">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) =>
                d < today ? (
                  <span key={d} className="py-2 text-center text-sm text-muted/50">
                    {Number(d.slice(8))}
                  </span>
                ) : (
                  <span key={d} className="flex justify-center [&_span]:w-full [&_span]:justify-center [&_span]:px-0">
                    <CheckChip name="dates" value={d} label={String(Number(d.slice(8)))} defaultChecked={d === chosen} />
                  </span>
                ),
              )}
            </div>
            <p className="text-[13px] text-muted">Tryk på de datoer, du kan. Tryk igen for at fravælge.</p>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Fra kl.
              <select name="start" defaultValue="08:00" className={inputClass}>
                {TIME_SLOTS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Til kl.
              <select name="end" defaultValue="16:00" className={inputClass}>
                {TIME_SLOTS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        </ActionForm>
      </section>
    </Screen>
  );
}
