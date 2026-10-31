import Link from "next/link";
import { Box } from "@/components/box";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatDate, todayDk } from "@/lib/dates";
import { formatKroner } from "@/lib/money";
import { nextPriceAfter, priceOn, type PriceRow } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import type { ServiceUsage } from "@/lib/prices";

const th = "px-3 py-2.5 font-semibold first:pl-[18px] last:pr-[18px]";
const td = "px-3 py-3 first:pl-[18px] last:pr-[18px]";

export default async function ServicesPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const schoolId = membership.schoolId;
  const supabase = await createClient();
  const today = todayDk();

  const [{ data: rateGroups }, { data: services }, { data: prices }, { data: usageData }] = await Promise.all([
    supabase.from("rate_groups").select("id, name, payroll_code, active").eq("school_id", schoolId).order("name"),
    supabase
      .from("services")
      .select("id, name, rate_group_id, active, lesson_types(name), service_categories(category_code, license_categories(sort_order))")
      .eq("school_id", schoolId)
      .order("name"),
    supabase.from("service_prices").select("service_id, valid_from, amount_ore").eq("school_id", schoolId),
    supabase.rpc("service_usage", { p_school: schoolId }),
  ]);

  const pricesBy = new Map<string, PriceRow[]>();
  for (const p of prices ?? []) pricesBy.set(p.service_id, [...(pricesBy.get(p.service_id) ?? []), p]);
  const usesBy = new Map(((usageData ?? []) as ServiceUsage[]).map((u) => [u.service_id, u.uses]));

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Ydelser og satser</h1>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/kontor/ydelser/satser/ny"
              className="inline-flex h-11 items-center rounded-xl border border-line2 bg-surface px-4 text-[15px] font-semibold"
            >
              + Ny sats
            </Link>
            <Link
              href="/kontor/ydelser/ny"
              className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
            >
              + Ny ydelse
            </Link>
          </div>
        )}
      </header>

      <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-[18px] py-3.5">
          <h2 className="text-lg font-bold">Satser</h2>
          <span className="text-[13px] text-muted">Grupper til løn og Dataløn-eksport</span>
        </div>
        <table className="w-full min-w-[560px] text-left text-[15px]">
          <thead className="text-[13px] text-muted">
            <tr>
              <th className={th}>Sats</th>
              <th className={th}>Løndel (Dataløn)</th>
              <th className={`${th} text-right`}>Ydelser</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(rateGroups ?? []).map((g) => (
              <tr key={g.id} className={`border-t border-line ${g.active ? "" : "text-muted"}`}>
                <td className={td}>
                  {isAdmin ? (
                    <Link href={`/kontor/ydelser/satser/${g.id}`} className="font-bold hover:text-accent-ink hover:underline">
                      {g.name}
                    </Link>
                  ) : (
                    <b>{g.name}</b>
                  )}
                </td>
                <td className={td}>{g.payroll_code ?? "–"}</td>
                <td className={`${td} text-right`}>
                  {(services ?? []).filter((s) => s.rate_group_id === g.id && s.active).length}
                </td>
                <td className={td}>{g.active ? <Pill tone="ok">Aktiv</Pill> : <Pill>Slået fra</Pill>}</td>
              </tr>
            ))}
            {!rateGroups?.length && <EmptyRow cols={4} text="Ingen satser endnu. Opret en sats, før du opretter ydelser." />}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-[18px] py-3.5">
          <h2 className="text-lg font-bold">Ydelser</h2>
          <span className="text-[13px] text-muted">Det der vælges ved planlægning og registrering</span>
        </div>
        <table className="w-full min-w-[680px] text-left text-[15px]">
          <thead className="text-[13px] text-muted">
            <tr>
              <th className={th}>Ydelse</th>
              <th className={th}>Kategori</th>
              <th className={th}>Type</th>
              <th className={`${th} text-right`}>Pris pr. lektion</th>
              <th className={`${th} text-right`}>Brugt</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          {(rateGroups ?? []).map((g) => {
            const list = (services ?? []).filter((s) => s.rate_group_id === g.id);
            if (!list.length) return null;
            return (
              <tbody key={g.id}>
                <tr className="border-t border-line bg-soft">
                  <td colSpan={6} className="px-[18px] py-2 text-[13px] font-bold text-muted">
                    {g.name}
                    {g.active ? "" : " (slået fra)"}
                  </td>
                </tr>
                {list.map((s) => {
                  const ps = pricesBy.get(s.id) ?? [];
                  const current = priceOn(ps, today);
                  const upcoming = nextPriceAfter(ps, today);
                  // Har ydelsen kun en kommende pris, er den også "nu" (første pris gælder bagud).
                  const next = upcoming && upcoming.valid_from !== current?.valid_from ? upcoming : null;
                  const live = s.active && g.active;
                  return (
                    <tr key={s.id} className={`border-t border-line ${live ? "" : "text-muted"}`}>
                      <td className={td}>
                        {isAdmin ? (
                          <Link href={`/kontor/ydelser/${s.id}`} className="font-bold hover:text-accent-ink hover:underline">
                            {s.name}
                          </Link>
                        ) : (
                          <b>{s.name}</b>
                        )}
                      </td>
                      <td className={td}>{categoryList(s.service_categories)}</td>
                      <td className={td}>{(s.lesson_types as unknown as { name: string } | null)?.name}</td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <b>{current ? formatKroner(current.amount_ore) : "–"}</b>
                        {next && (
                          <span className="block text-[13px] text-muted">
                            {formatKroner(next.amount_ore)} fra {formatDate(next.valid_from)}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>{usesBy.get(s.id) ?? 0}</td>
                      <td className={td}>{s.active ? <Pill tone="ok">Aktiv</Pill> : <Pill>Slået fra</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          {!services?.length && (
            <tbody>
              <EmptyRow cols={6} text="Ingen ydelser endnu." />
            </tbody>
          )}
        </table>
      </section>

      <Box title="Sådan virker priserne">
        <p className="text-[15px] text-muted">
          En prisændring gælder fra en dato. Lektioner før datoen beholder den gamle pris, og godkendte lektioner beholder
          altid den pris, de blev godkendt med. En lærer kan have sin egen pris på en ydelse; den sættes på lærerens side
          under Undervisere. Ydelser og satser, der er brugt, kan kun slås fra, ikke slettes.
          {isAdmin ? "" : " Kun admin kan rette ydelser, satser og priser."}
        </p>
      </Box>
    </>
  );
}

type ServiceCategory = { category_code: string; license_categories: { sort_order: number } | null };

function categoryList(rows: unknown) {
  return (rows as ServiceCategory[])
    .sort((a, b) => (a.license_categories?.sort_order ?? 0) - (b.license_categories?.sort_order ?? 0))
    .map((c) => c.category_code)
    .join(", ");
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-[18px] py-4 text-muted">
        {text}
      </td>
    </tr>
  );
}
