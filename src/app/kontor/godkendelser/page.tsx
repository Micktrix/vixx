import Link from "next/link";
import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { FLAG_LABEL, type Flag } from "@/lib/approval";
import { requireRole } from "@/lib/auth/session";
import { addDays, formatDate, formatShortDay, todayDk } from "@/lib/dates";
import { formatKroner } from "@/lib/money";
import { periodFor } from "@/lib/pay-period";
import { formatSpan } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { InstructorFilter } from "../calendar/instructor-filter";
import { loadSchedule } from "../schedule-data";
import { approveMatching, approveRegistration, rejectRegistration } from "./actions";
import { loadApprovals, type ApprovalRow, type Status } from "./data";

const TABS: { status: Status; label: string }[] = [
  { status: "pending", label: "Mangler godkendelse" },
  { status: "approved", label: "Godkendt" },
  { status: "rejected", label: "Afvist" },
];
const FLAG_TONE: Record<Flag, "ok" | "accent" | "neutral"> = { matcher: "ok", afvigelse: "accent", uplanlagt: "neutral" };
const EMPTY: Record<Status, string> = {
  pending: "Alt er godkendt. Nye registreringer dukker op her.",
  approved: "Ingen godkendte lektioner endnu.",
  rejected: "Ingen afviste lektioner.",
};

export default async function ApprovalsPage({ searchParams }: PageProps<"/kontor/godkendelser">) {
  const { membership } = await requireRole(["admin", "office"]);
  const sp = await searchParams;
  const status: Status = TABS.some((t) => t.status === sp.status) ? (sp.status as Status) : "pending";
  const instructor = typeof sp.laerer === "string" && sp.laerer ? sp.laerer : null;
  const supabase = await createClient();
  const today = todayDk();

  const { data: school } = await supabase.from("schools").select("pay_period_start_day").eq("id", membership.schoolId).single();
  const period = periodFor(today, school?.pay_period_start_day ?? 21);

  const countFor = (s: Status) => {
    let q = supabase.from("registrations").select("id", { count: "exact", head: true }).eq("school_id", membership.schoolId).eq("status", s);
    if (instructor) q = q.eq("instructor_id", instructor);
    return q;
  };
  const [rows, schedule, counts, { data: locked }] = await Promise.all([
    loadApprovals(membership.schoolId, status, instructor),
    loadSchedule(membership.schoolId, period.start, addDays(today, -1) < period.start ? period.start : addDays(today, -1)),
    Promise.all(TABS.map((t) => countFor(t.status))),
    supabase.from("pay_periods").select("starts_on, ends_on").eq("school_id", membership.schoolId).eq("locked", true),
  ]);
  const count = Object.fromEntries(TABS.map((t, i) => [t.status, counts[i].count ?? 0])) as Record<Status, number>;
  const isLocked = (d: string) => (locked ?? []).some((p) => p.starts_on <= d && d <= p.ends_on);

  // Hvem besluttede: navne fra profilerne (decided_by peger på login-brugeren).
  const deciderIds = [...new Set(rows.map((r) => r.decidedBy).filter((id): id is string => !!id))];
  const { data: deciders } = deciderIds.length ? await supabase.from("profiles").select("id, full_name").in("id", deciderIds) : { data: [] };
  const deciderName = new Map((deciders ?? []).map((p) => [p.id, p.full_name]));

  const matching = status === "pending" ? rows.filter((r) => r.flag === "matcher" && !isLocked(r.date)).length : 0;
  const href = (s: Status, i: string | null) => `/kontor/godkendelser?status=${s}${i ? `&laerer=${i}` : ""}`;
  const hrefFor = Object.fromEntries(["", ...schedule.instructors.map((i) => i.id)].map((id) => [id, href(status, id || null)]));

  // Mangler registrering i denne lønperiode (planlagt før i dag, intet registreret).
  const { data: regDays } = await supabase
    .from("registrations")
    .select("instructor_id, lesson_date")
    .eq("school_id", membership.schoolId)
    .gte("lesson_date", period.start)
    .lt("lesson_date", today);
  const registered = new Set((regDays ?? []).map((r) => `${r.instructor_id}|${r.lesson_date}`));
  const missing = schedule.instructors
    .filter((i) => !instructor || i.id === instructor)
    .map((i) => ({
      name: i.name,
      days: [...new Set(schedule.lessons.filter((l) => l.instructorId === i.id && l.date < today).map((l) => l.date))]
        .filter((d) => !registered.has(`${i.id}|${d}`))
        .sort(),
    }))
    .filter((m) => m.days.length);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Kontor</p>
          <h1 className="text-[30px] font-bold">Godkendelser</h1>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <InstructorFilter instructors={schedule.instructors} value={instructor} hrefFor={hrefFor} />
          {matching > 0 && (
            <ActionForm
              action={approveMatching}
              submitLabel={`Godkend alle der matcher (${matching})`}
              pendingLabel="Godkender …"
              className="flex flex-col items-end gap-2"
            >
              <input type="hidden" name="instructorId" value={instructor ?? ""} />
            </ActionForm>
          )}
        </div>
      </header>

      <nav aria-label="Status" className="flex w-fit flex-wrap rounded-[10px] border border-line2 bg-surface p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={href(t.status, instructor)}
            aria-current={t.status === status ? "page" : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${t.status === status ? "bg-accent-bg text-accent-ink" : "text-muted"}`}
          >
            {t.label} ({count[t.status]})
          </Link>
        ))}
      </nav>

      {status === "pending" && rows.length > 0 && (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            <b>{rows.length}</b> afventer
          </span>
          {(Object.keys(FLAG_LABEL) as Flag[]).map((f) => (
            <span key={f} className="flex items-center gap-1">
              <Pill tone={FLAG_TONE[f]}>{rows.filter((r) => r.flag === f).length}</Pill> {FLAG_LABEL[f].toLowerCase()}
            </span>
          ))}
        </p>
      )}
      {status === "rejected" && rows.length > 0 && (
        <p className="text-sm text-muted">
          Afviste lektioner venter på, at læreren retter og sender igen. Kontoret kan også rette og godkende direkte.
        </p>
      )}

      {status === "pending" && missing.length > 0 && (
        <section className="flex flex-col gap-1 rounded-[16px] border border-bad/30 bg-bad-bg px-[18px] py-3 text-sm">
          <b className="text-bad">Mangler registrering i lønperioden</b>
          {missing.map((m) => (
            <span key={m.name}>
              {m.name}: {m.days.map(formatDate).join(", ")}
            </span>
          ))}
        </section>
      )}

      {rows.length ? (
        <section className="overflow-x-auto rounded-[20px] border border-line bg-surface">
          <table className="w-full min-w-[900px] text-left text-[14px]">
            <thead className="text-[12px] text-muted">
              <tr>
                <th className="py-2.5 pr-3 pl-[18px] font-semibold">Underviser</th>
                <th className="px-3 py-2.5 font-semibold">Dato</th>
                <th className="px-3 py-2.5 font-semibold">Lektion</th>
                <th className="px-3 py-2.5 text-right font-semibold">Plan.</th>
                <th className="px-3 py-2.5 text-right font-semibold">Reg.</th>
                <th className="px-3 py-2.5 font-semibold">{status === "pending" ? "Kontrol" : "Status"}</th>
                <th className="py-2.5 pr-[18px] pl-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prev = rows[i - 1];
                const newGroup = !prev || prev.instructorId !== r.instructorId || prev.date !== r.date;
                return (
                  <tr key={r.id} className={`align-top ${newGroup ? "border-t border-line" : ""}`} data-testid="approval-row">
                    <td className="py-3 pr-3 pl-[18px]">{newGroup && <b>{r.instructorName}</b>}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{newGroup && formatShortDay(r.date)}</td>
                    <td className="px-3 py-3">
                      <span className="text-muted">{formatSpan(r)}</span> <b>{r.serviceName}</b>
                      <span className="text-muted"> · {r.category}</span>
                      {r.studentName && <span className="block text-[13px] text-muted">Elev: {r.studentName}</span>}
                      {r.note && <span className="block text-[13px] text-muted">{r.note}</span>}
                    </td>
                    <td className="px-3 py-3 text-right">{r.plannedCount ?? "–"}</td>
                    <td className="px-3 py-3 text-right">
                      <b>{r.count}</b>
                    </td>
                    <td className="px-3 py-3">
                      <Decision row={r} deciderName={r.decidedBy ? deciderName.get(r.decidedBy) : undefined} />
                    </td>
                    <td className="py-3 pr-[18px] pl-3">
                      {isLocked(r.date) ? <span className="text-muted">Låst</span> : <Actions row={r} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="rounded-[20px] border border-line bg-surface px-[18px] py-4 text-muted">{EMPTY[status]}</p>
      )}
    </>
  );
}

function Decision({ row, deciderName }: { row: ApprovalRow; deciderName?: string }) {
  const by = (
    <span className="block text-[12px] text-muted">
      af <b>{deciderName ?? "Kontoret"}</b>
      {row.decidedAt && ` · ${formatDate(row.decidedAt.slice(0, 10))} ${row.decidedAt.slice(11, 16)}`}
    </span>
  );
  if (row.status === "pending") return <Pill tone={FLAG_TONE[row.flag]}>{FLAG_LABEL[row.flag]}</Pill>;
  if (row.status === "approved") {
    return (
      <>
        <Pill tone="ok">Godkendt</Pill>
        {by}
        {row.unitPriceOre != null && (
          <span className="block text-[12px] text-muted" data-testid="locked-amount">
            {row.count} × {formatKroner(row.unitPriceOre)} = {formatKroner(row.count * row.unitPriceOre)}
          </span>
        )}
        {row.officeEdited && <span className="block text-[12px] text-muted">Rettet af kontoret</span>}
      </>
    );
  }
  return (
    <>
      <Pill tone="bad">Afvist</Pill>
      {by}
      {row.comment && <span className="block text-[12px]">{row.comment}</span>}
    </>
  );
}

function Actions({ row }: { row: ApprovalRow }) {
  const edit = (
    <Link
      href={`/kontor/godkendelser/ret?id=${row.id}`}
      className="inline-flex h-9 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold"
    >
      {row.status === "rejected" ? "Ret og godkend" : "Ret"}
    </Link>
  );
  if (row.status !== "pending") return <div className="flex justify-end">{edit}</div>;
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <ActionForm action={approveRegistration} submitLabel="Godkend" pendingLabel="…" className="flex flex-col items-end gap-1">
        <input type="hidden" name="id" value={row.id} />
      </ActionForm>
      {edit}
      <details className="group relative">
        <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[10px] border border-bad/40 bg-surface px-3 text-sm font-semibold text-bad">
          Afvis
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-[280px] rounded-xl border border-line bg-surface p-3 shadow-lg">
          <ActionForm action={rejectRegistration} submitLabel="Afvis og send besked" pendingLabel="Afviser …" primary={false}>
            <input type="hidden" name="id" value={row.id} />
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Kommentar til læreren
              <textarea
                name="comment"
                required
                rows={3}
                maxLength={300}
                placeholder="Fx forkert ydelse – skal være Manøvre B"
                className="w-full rounded-[10px] border border-line2 px-3 py-2 font-normal"
              />
            </label>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
