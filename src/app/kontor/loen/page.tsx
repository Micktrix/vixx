import Link from "next/link";
import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatDate, parseDateInput, todayDk } from "@/lib/dates";
import { formatKroner } from "@/lib/money";
import { nextPeriod, periodFor, previousPeriod } from "@/lib/pay-period";
import { exportLines, summarize, toDatalonCsv } from "@/lib/payroll";
import { formatDuration } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { lockPeriod, unlockPeriod } from "./actions";
import { loadPayroll } from "./data";

const navButton = "inline-flex h-10 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold";

export default async function PayrollPage({ searchParams }: PageProps<"/kontor/loen">) {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: school } = await supabase
    .from("schools")
    .select("pay_period_start_day, lesson_minutes")
    .eq("id", membership.schoolId)
    .single();
  const startDay = school?.pay_period_start_day ?? 21;
  const period = periodFor(parseDateInput(typeof sp.periode === "string" ? sp.periode : "") ?? todayDk(), startDay);

  const payroll = await loadPayroll(membership.schoolId, period);
  const summary = summarize(payroll.instructors, payroll.registrations);
  const lines = exportLines(payroll.instructors, payroll.registrations);

  // Satser, der har godkendte lektioner i perioden, som kolonner.
  const rateGroups = [
    ...new Map(
      payroll.registrations.filter((r) => r.status === "approved").map((r) => [r.rateGroupId, r.rateGroupName]),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "da"));

  const staff = summary.filter((s) => !s.instructor.isGuest);
  const guests = summary.filter((s) => s.instructor.isGuest);
  const totalCount = staff.reduce((n, s) => n + s.approvedCount, 0);
  const totalOre = staff.reduce((n, s) => n + s.approvedOre, 0);
  const guestOre = guests.reduce((n, s) => n + s.approvedOre, 0);
  const pending = summary.reduce((n, s) => n + s.pendingCount, 0);
  const missingNumber = staff.filter((s) => s.approvedCount && !s.instructor.employeeNumber).map((s) => s.instructor.name);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Lønoverblik</h1>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {payroll.locked
            ? isAdmin && (
                <ActionForm
                  action={unlockPeriod}
                  submitLabel="Lås op"
                  pendingLabel="Låser op …"
                  primary={false}
                  confirmText="Lås perioden op? Så kan registreringer i den rettes igen."
                  className="flex flex-col items-end gap-2"
                >
                  <input type="hidden" name="start" value={period.start} />
                </ActionForm>
              )
            : (
                <ActionForm
                  action={lockPeriod}
                  submitLabel="Lås periode"
                  pendingLabel="Låser …"
                  primary={false}
                  confirmText="Lås perioden? Derefter kan intet i den ændres, før admin låser op."
                  className="flex flex-col items-end gap-2"
                >
                  <input type="hidden" name="start" value={period.start} />
                </ActionForm>
              )}
          <a
            href={`/kontor/loen/eksport?periode=${period.start}`}
            download
            className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
          >
            Eksport til Dataløn (CSV)
          </a>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/kontor/loen?periode=${previousPeriod(period, startDay).start}`} aria-label="Forrige lønperiode" className={navButton}>
          ‹
        </Link>
        <Link href={`/kontor/loen?periode=${nextPeriod(period, startDay).start}`} aria-label="Næste lønperiode" className={navButton}>
          ›
        </Link>
        <h2 className="ml-1 text-lg font-bold">
          {formatDate(period.start)} – {formatDate(period.end)}
        </h2>
        {payroll.locked ? (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Pill tone="neutral">Låst</Pill>
            {payroll.lockedByName && `af ${payroll.lockedByName}`}
            {payroll.lockedAt && ` · ${formatDate(payroll.lockedAt.slice(0, 10))}`}
          </span>
        ) : (
          <Pill tone="ok">Åben</Pill>
        )}
      </div>

      {pending > 0 && (
        <p className="rounded-xl border border-accent-line bg-accent-bg px-3.5 py-2.5 text-sm">
          {pending} lektion{pending === 1 ? "" : "er"} afventer godkendelse og er ikke med i tallene.{" "}
          <Link href="/kontor/godkendelser" className="font-semibold text-accent-ink underline underline-offset-[3px]">
            Gå til godkendelser
          </Link>
        </p>
      )}
      {missingNumber.length > 0 && (
        <p className="rounded-xl border border-bad/30 bg-bad-bg px-3.5 py-2.5 text-sm text-bad">
          Mangler medarbejdernr. (bruges i Dataløn): {missingNumber.join(", ")}.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Godkendte lektioner" value={String(totalCount)} />
        <Kpi label="Timer i alt" value={formatDuration(totalCount * (school?.lesson_minutes ?? 45)) || "0 t"} />
        <Kpi label="Løn i alt (Dataløn)" value={formatKroner(totalOre)} highlight testId="total-pay" />
        <Kpi label="Gæster (faktura)" value={formatKroner(guestOre)} />
      </section>

      <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead className="text-[12px] text-muted">
            <tr>
              <th className="py-2.5 pr-3 pl-[18px] font-semibold">Underviser</th>
              {rateGroups.map(([id, name]) => (
                <th key={id} className="px-3 py-2.5 text-right font-semibold">
                  {name}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-semibold">I alt</th>
              <th className="py-2.5 pr-[18px] pl-3 text-right font-semibold">Afventer</th>
            </tr>
          </thead>
          <tbody>
            {[...staff, ...guests].map((s) => (
              <tr key={s.instructor.id} className="border-t border-line" data-testid="payroll-row">
                <td className="py-3 pr-3 pl-[18px]">
                  <b>{s.instructor.name}</b>
                  <span className="block text-[12px] text-muted">
                    {s.instructor.isGuest ? "Gæst · faktura, ikke i Dataløn" : `Medarbejdernr. ${s.instructor.employeeNumber ?? "–"}`}
                  </span>
                </td>
                {rateGroups.map(([id]) => {
                  const g = s.byRateGroup.get(id);
                  return (
                    <td key={id} className="px-3 py-3 text-right whitespace-nowrap">
                      {g ? (
                        <>
                          {g.count} lek.
                          <span className="block text-[12px] text-muted">{formatKroner(g.ore)}</span>
                        </>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <b>{s.approvedCount} lek.</b>
                  <span className="block font-semibold" data-testid="payroll-amount">
                    {formatKroner(s.approvedOre)}
                  </span>
                </td>
                <td className="py-3 pr-[18px] pl-3 text-right">{s.pendingCount || <span className="text-muted">–</span>}</td>
              </tr>
            ))}
            {!summary.length && (
              <tr>
                <td colSpan={rateGroups.length + 3} className="px-[18px] py-4 text-muted">
                  Ingen lektioner i perioden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <details className="rounded-[20px] border border-line bg-surface p-[18px]">
        <summary className="cursor-pointer font-bold">Vis eksportfilen ({lines.length} {lines.length === 1 ? "linje" : "linjer"})</summary>
        <p className="mt-2 text-[13px] text-muted">
          Eksempel på formatet. Kolonner og løndele tilpasses jeres importfil med fleksible løndele. Gæstelærere er ikke med, da de
          afregnes via faktura.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-soft p-3 text-[12px]" data-testid="csv-preview">
          {toDatalonCsv(lines)}
        </pre>
      </details>

      <p className="text-[13px] text-muted">
        Kun godkendte lektioner tæller, med den pris der blev låst ved godkendelsen. Lektionerne er fordelt på satser. Timer er
        lektioner à {school?.lesson_minutes ?? 45} min.
      </p>
    </>
  );
}

function Kpi({ label, value, highlight, testId }: { label: string; value: string; highlight?: boolean; testId?: string }) {
  return (
    <div className={`rounded-[16px] border p-4 ${highlight ? "border-accent-line bg-accent-bg" : "border-line bg-surface"}`}>
      <p className="text-sm text-muted">{label}</p>
      <b className="text-2xl" data-testid={testId}>
        {value}
      </b>
    </div>
  );
}
