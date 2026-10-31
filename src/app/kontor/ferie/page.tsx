import Link from "next/link";
import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { calendarHref } from "../calendar/params";
import { decideHoliday } from "./actions";

const TABS = [
  { status: "pending", label: "Afventer" },
  { status: "approved", label: "Godkendt" },
  { status: "rejected", label: "Afvist" },
] as const;

type Status = (typeof TABS)[number]["status"];

type HolidayRow = {
  id: string;
  from_date: string;
  to_date: string;
  note: string | null;
  status: Status;
  decided_by: string | null;
  decided_at: string | null;
  instructors: { school_members: { profiles: { full_name: string } | null } | null } | null;
};

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

export default async function OfficeHolidaysPage({ searchParams }: PageProps<"/kontor/ferie">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const status: Status = TABS.some((t) => t.status === sp.status) ? (sp.status as Status) : "pending";
  const supabase = await createClient();

  const [{ data }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("holidays")
      .select(
        "id, from_date, to_date, note, status, decided_by, decided_at, instructors(school_members(profiles(full_name)))",
      )
      .eq("school_id", membership.schoolId)
      .eq("status", status)
      .order("from_date", { ascending: status === "pending" }),
    supabase
      .from("holidays")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("status", "pending"),
  ]);
  const rows = (data ?? []) as unknown as HolidayRow[];

  // Hvem besluttede: decided_by peger på login-brugeren, så navnet hentes fra profilerne.
  const deciderIds = [...new Set(rows.map((h) => h.decided_by).filter((id): id is string => !!id))];
  const { data: deciders } = deciderIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", deciderIds)
    : { data: [] };
  const deciderName = new Map((deciders ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Ferie</h1>
      </header>

      <nav aria-label="Status" className="flex w-fit rounded-[10px] border border-line2 bg-surface p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/kontor/ferie?status=${t.status}`}
            aria-current={t.status === status ? "page" : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${
              t.status === status ? "bg-accent-bg text-accent-ink" : "text-muted"
            }`}
          >
            {t.label}
            {t.status === "pending" && pendingCount ? ` (${pendingCount})` : ""}
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-2">
        {rows.map((h) => (
          <article
            key={h.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-[16px] border border-line bg-surface px-[18px] py-3.5"
            data-testid="holiday"
          >
            <div className="flex flex-col gap-0.5">
              <b>{h.instructors?.school_members?.profiles?.full_name}</b>
              <span>
                {formatDate(h.from_date)} – {formatDate(h.to_date)}{" "}
                <span className="text-muted">({days(h.from_date, h.to_date)} dage)</span>
              </span>
              {h.note && <span className="text-sm text-muted">{h.note}</span>}
              {h.status !== "pending" && h.decided_at && (
                <span className="text-[13px] text-muted">
                  {h.status === "approved" ? "Godkendt" : "Afvist"} af {(h.decided_by && deciderName.get(h.decided_by)) ?? "ukendt"}{" "}
                  {formatDate(h.decided_at.slice(0, 10))}
                </span>
              )}
              <Link href={calendarHref({ view: "uge", date: h.from_date })} className="text-sm font-semibold text-accent-ink hover:underline">
                Se ugen i kalenderen
              </Link>
            </div>
            {h.status === "pending" ? (
              <div className="flex flex-wrap items-start gap-2">
                <ActionForm action={decideHoliday} submitLabel="Godkend" pendingLabel="Godkender …" className="flex flex-col items-end gap-2">
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="decision" value="approved" />
                </ActionForm>
                <ActionForm
                  action={decideHoliday}
                  submitLabel="Afvis"
                  pendingLabel="Afviser …"
                  primary={false}
                  confirmText="Afvis ferieanmodningen?"
                  className="flex flex-col items-end gap-2"
                >
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="decision" value="rejected" />
                </ActionForm>
              </div>
            ) : (
              <Pill tone={h.status === "approved" ? "ok" : "bad"}>{h.status === "approved" ? "Godkendt" : "Afvist"}</Pill>
            )}
          </article>
        ))}
        {rows.length === 0 && (
          <p className="rounded-[16px] border border-line bg-surface px-[18px] py-4 text-muted">Ingen her.</p>
        )}
      </section>
      <p className="text-[13px] text-muted">
        Ferie kan først godkendes, når underviseren ikke har planlagte lektioner i perioden. Godkendt ferie blokerer dagene.
      </p>
    </>
  );
}
