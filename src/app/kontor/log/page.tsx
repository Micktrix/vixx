import Link from "next/link";
import { inputClass, primaryButtonClass } from "@/components/styles";
import { describe, type Names } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { formatLongDate, parseDateInput } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

type Entry = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  table_name: string;
  changes: Record<string, unknown>;
};

const PAGE_SIZE = 100;
const dkTime = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });
const dkDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" });

export default async function AuditLogPage({ searchParams }: PageProps<"/kontor/log">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const query = one("q").trim();
  const from = parseDateInput(one("fra"));
  const to = parseDateInput(one("til"));
  const before = Number(one("foer")) || null;
  const supabase = await createClient();

  const [{ data }, { data: instructors }, { data: services }, { data: types }, { data: groups }] = await Promise.all([
    supabase.rpc("search_audit", {
      p_school: membership.schoolId,
      p_query: query || null,
      p_from: from,
      p_to: to,
      p_before: before,
      p_limit: PAGE_SIZE,
    }),
    supabase.from("instructors").select("id, school_members(profiles(full_name))").eq("school_id", membership.schoolId),
    supabase.from("services").select("id, name").eq("school_id", membership.schoolId),
    supabase.from("lesson_types").select("id, name").eq("school_id", membership.schoolId),
    supabase.from("rate_groups").select("id, name").eq("school_id", membership.schoolId),
  ]);

  const names: Names = {
    instructors: new Map(
      (instructors ?? []).map((i) => [
        i.id,
        (i.school_members as unknown as { profiles: { full_name: string } | null } | null)?.profiles?.full_name ?? "",
      ]),
    ),
    services: new Map((services ?? []).map((s) => [s.id, s.name])),
    other: new Map([...(types ?? []), ...(groups ?? [])].map((t) => [t.id, t.name])),
  };

  const entries = (data ?? []) as Entry[];
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const day = dkDate.format(new Date(e.occurred_at));
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const moreHref = () => {
    const q = new URLSearchParams();
    if (query) q.set("q", query);
    if (from) q.set("fra", from);
    if (to) q.set("til", to);
    q.set("foer", String(entries.at(-1)!.id));
    return `/kontor/log?${q}`;
  };

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Ændringslog</h1>
        <p className="text-muted">Hvem har ændret hvad og hvornår. Følsomme oplysninger vises ikke.</p>
      </header>

      <form method="get" className="grid gap-3 rounded-[20px] border border-line bg-surface p-[18px] sm:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Søg
          <input name="q" defaultValue={query} placeholder="Fx et navn, en ydelse eller en note" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Fra
          <input type="date" name="fra" defaultValue={from ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Til
          <input type="date" name="til" defaultValue={to ?? ""} className={inputClass} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={primaryButtonClass}>
            Søg
          </button>
          {(query || from || to) && (
            <Link href="/kontor/log" className="py-2.5 text-sm font-semibold text-muted hover:text-ink">
              Nulstil
            </Link>
          )}
        </div>
      </form>

      {[...byDay].map(([day, list]) => (
        <section key={day} className="rounded-[20px] border border-line bg-surface">
          <h2 className="border-b border-line px-[18px] py-3 font-bold">{formatLongDate(day)}</h2>
          <ul>
            {list.map((e) => {
              const d = describe(e, names);
              return (
                <li key={e.id} className="flex gap-4 border-b border-line px-[18px] py-2.5 last:border-b-0" data-testid="audit-entry">
                  <span className="w-12 shrink-0 text-sm text-muted">{dkTime.format(new Date(e.occurred_at))}</span>
                  <span className="min-w-0">
                    <span>
                      <b>{e.actor_name ?? "Systemet"}</b> {d.title.charAt(0).toLowerCase() + d.title.slice(1)}
                    </span>
                    {d.details.length > 0 && (
                      <span className="block text-[13px] text-muted">{d.details.slice(0, 6).join(" · ")}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!entries.length && (
        <p className="rounded-[20px] border border-line bg-surface px-[18px] py-4 text-muted">
          {query || from || to ? "Ingen ændringer matcher søgningen." : "Ingen ændringer endnu."}
        </p>
      )}
      {entries.length === PAGE_SIZE && (
        <Link href={moreHref()} className="self-start text-sm font-semibold text-accent-ink hover:underline">
          Vis ældre ændringer
        </Link>
      )}
    </>
  );
}
