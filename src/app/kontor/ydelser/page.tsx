import Link from "next/link";
import { Box } from "@/components/box";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatDate, todayDk } from "@/lib/dates";
import { formatKroner } from "@/lib/money";
import { nextPriceAfter, priceOn, type PriceRow } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import { moveService, toggleBreak } from "./actions";
import type { ServiceUsage } from "@/lib/prices";

const th = "px-3 py-2.5 font-semibold first:pl-[18px] last:pr-[18px]";
const td = "px-3 py-3 first:pl-[18px] last:pr-[18px]";

export default async function ServicesPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const schoolId = membership.schoolId;
  const supabase = await createClient();
  const today = todayDk();

  const [{ data: services }, { data: prices }, { data: usageData }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, payroll_code, active, break_after")
      .eq("school_id", schoolId)
      .order("sort_order")
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
          <Link
            href="/kontor/ydelser/ny"
            className="inline-flex h-11 items-center rounded-xl border border-accent bg-accent px-4 text-[15px] font-bold text-ink"
          >
            + Ny ydelse
          </Link>
        )}
      </header>

      <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-[18px] py-3.5">
          <h2 className="text-lg font-bold">Ydelser</h2>
          <span className="text-[13px] text-muted">
            Det der vælges ved planlægning og registrering, med sats og løndel til lønnen
          </span>
        </div>
        <table className="w-full min-w-[680px] text-left text-[15px]">
          <thead className="text-[13px] text-muted">
            <tr>
              {isAdmin && <th className={`${th} w-[1%]`}>Rækkefølge</th>}
              <th className={th}>Ydelse</th>
              <th className={`${th} text-right`}>Sats pr. lektion</th>
              <th className={th}>Løndel</th>
              <th className={`${th} text-right`}>Brugt</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(services ?? []).map((s, i, all) => {
              const ps = pricesBy.get(s.id) ?? [];
              const current = priceOn(ps, today);
              const upcoming = nextPriceAfter(ps, today);
              // Har ydelsen kun en kommende pris, er den også "nu" (første pris gælder bagud).
              const next = upcoming && upcoming.valid_from !== current?.valid_from ? upcoming : null;
              return (
                <tr
                  key={s.id}
                  className={`${i > 0 && all[i - 1].break_after ? "border-t-4 border-line2" : "border-t border-line"} ${s.active ? "" : "text-muted"}`}
                  data-testid="service-row"
                >
                  {isAdmin && (
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="flex items-center gap-1">
                        <MoveButton id={s.id} dir="up" disabled={i === 0} />
                        <MoveButton id={s.id} dir="down" disabled={i === all.length - 1} />
                        {i < all.length - 1 && (
                          <form action={toggleBreak}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="breakAfter" value={String(s.break_after)} />
                            <button
                              type="submit"
                              className={`ml-1 rounded-lg border px-2 py-1 text-[12px] font-semibold ${
                                s.break_after ? "border-line2 bg-soft text-ink" : "border-line text-muted hover:text-ink"
                              }`}
                            >
                              {s.break_after ? "Fjern streg" : "Streg efter"}
                            </button>
                          </form>
                        )}
                      </span>
                    </td>
                  )}
                  <td className={td}>
                    {isAdmin ? (
                      <Link
                        href={`/kontor/ydelser/${s.id}`}
                        className="font-bold hover:text-accent-ink hover:underline"
                      >
                        {s.name}
                      </Link>
                    ) : (
                      <b>{s.name}</b>
                    )}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <b>{current ? formatKroner(current.amount_ore) : "–"}</b>
                    {next && (
                      <span className="block text-[13px] text-muted">
                        {formatKroner(next.amount_ore)} fra {formatDate(next.valid_from)}
                      </span>
                    )}
                  </td>
                  <td className={td}>{s.payroll_code ?? <span className="text-muted">–</span>}</td>
                  <td className={`${td} text-right`}>{usesBy.get(s.id) ?? 0}</td>
                  <td className={td}>{s.active ? <Pill tone="ok">Aktiv</Pill> : <Pill>Slået fra</Pill>}</td>
                </tr>
              );
            })}
            {!services?.length && <EmptyRow cols={isAdmin ? 6 : 5} text="Ingen ydelser endnu. Opret den første med + Ny ydelse." />}
          </tbody>
        </table>
      </section>

      <Box title="Sådan virker satserne">
        <p className="text-[15px] text-muted">
          Hver ydelse har sin egen sats pr. lektion og sin løndel til Dataløn. Flere ydelser må gerne have samme sats.
          En ændring af satsen gælder fra en dato: lektioner før datoen beholder den gamle sats, og godkendte lektioner
          beholder altid den sats, de blev godkendt med. En lærer kan have sin egen sats på en ydelse; den sættes på
          lærerens side under Undervisere. En ydelse, der er brugt, kan kun slås fra, ikke slettes.
          Rækkefølgen her er den samme som i dropdown, når man planlægger og registrerer. Med ↑ ↓ flyttes de mest brugte op,
          og &quot;Streg efter&quot; deler listen i klynger.
          {isAdmin ? "" : " Kun admin kan rette ydelser og satser."}
        </p>
      </Box>
    </>
  );
}

function MoveButton({ id, dir, disabled }: { id: string; dir: "up" | "down"; disabled: boolean }) {
  return (
    <form action={moveService}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={dir === "up" ? "Flyt op" : "Flyt ned"}
        className="size-8 rounded-lg border border-line text-[15px] font-bold text-muted hover:text-ink disabled:opacity-30"
      >
        {dir === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
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
