import Link from "next/link";
import { loadBookings, loadResources, type Booking } from "@/lib/booking-data";
import { resourceDetail } from "@/lib/resources";
import { addDays, formatDate, formatLongDate, parseDateInput, todayDk } from "@/lib/dates";
import { formatSpan } from "@/lib/schedule";
import { Screen } from "../screen";
import { getTeacher } from "../teacher-data";

const navButton = "inline-flex size-[42px] items-center justify-center rounded-xl border border-line bg-surface text-lg";

// Book et lokale eller køretøj. Lærere kan booke ledige frit og rette/slette egne bookinger.
export default async function BookPage({ searchParams }: PageProps<"/laerer/book">) {
  const teacher = await getTeacher();
  const sp = await searchParams;
  const today = todayDk();
  const date = parseDateInput(typeof sp.dato === "string" ? sp.dato : "") ?? today;
  const kind = sp.type === "vehicle" ? "vehicle" : "room";
  const schoolId = teacher.membership.schoolId;

  const [resources, bookings, upcoming] = await Promise.all([
    loadResources(schoolId),
    loadBookings(schoolId, date, date),
    loadBookings(schoolId, today, addDays(today, 60)),
  ]);
  // Køretøjer i lærerens kategorier (eller uden kategori).
  const list = resources.filter(
    (r) => r.kind === kind && (kind === "room" || !r.categories.length || r.categories.some((c) => teacher.categories.includes(c))),
  );
  const mine = upcoming.filter((b) => b.instructorId === teacher.instructorId && !b.lessonId);
  const href = (p: { dato?: string; type?: string }) => `/laerer/book?dato=${p.dato ?? date}&type=${p.type ?? kind}`;
  const who = (b: Booking) => (b.instructorId === teacher.instructorId ? "Dig" : (b.instructorName ?? "Kontoret"));

  return (
    <Screen
      title="Book"
      sub={formatLongDate(date)}
      action={
        <span className="flex gap-2">
          <Link href={href({ dato: addDays(date, -1) })} aria-label="Forrige dag" className={navButton}>‹</Link>
          <Link href={href({ dato: addDays(date, 1) })} aria-label="Næste dag" className={navButton}>›</Link>
        </span>
      }
    >
      <nav aria-label="Vælg" className="flex rounded-[12px] border border-line2 bg-surface p-0.5">
        {(["room", "vehicle"] as const).map((k) => (
          <Link
            key={k}
            href={href({ type: k })}
            aria-current={k === kind ? "page" : undefined}
            className={`flex-1 rounded-[10px] py-2 text-center text-sm font-bold ${k === kind ? "bg-accent text-ink" : "text-muted"}`}
          >
            {k === "room" ? "Lokaler" : "Køretøjer"}
          </Link>
        ))}
      </nav>
      {date !== today && (
        <Link href={href({ dato: today })} className="self-center text-sm font-semibold text-accent-ink">
          Gå til i dag
        </Link>
      )}

      {mine.length > 0 && (
        <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]">
          <h2 className="font-bold">Mine bookinger</h2>
          {mine.map((b) => (
            <Link
              key={b.id}
              href={`/laerer/book/ny?id=${b.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm hover:border-accent"
            >
              <span>
                <b>
                  {formatDate(b.date)} · {formatSpan(b)}
                </b>
                <span className="block text-muted">
                  {resources.find((r) => r.id === b.resourceId)?.name}
                  {b.title ? ` · ${b.title}` : ""}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-accent-ink">Ret</span>
            </Link>
          ))}
        </section>
      )}

      {list.map((r) => {
        const own = bookings.filter((b) => b.resourceId === r.id);
        return (
          <section key={r.id} className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="resource-card">
            <div className="flex items-center justify-between gap-2">
              <b>
                {r.name}
                {resourceDetail(r) ? <span className="font-normal text-muted"> · {resourceDetail(r)}</span> : null}
              </b>
              {date >= today && (
                <Link
                  href={`/laerer/book/ny?ressource=${r.id}&dato=${date}`}
                  className="inline-flex h-9 items-center rounded-[10px] border border-accent bg-accent px-3 text-sm font-bold text-ink"
                >
                  Book
                </Link>
              )}
            </div>
            {own.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {own.map((b) => {
                  const text = (
                    <>
                      <b>{formatSpan(b)}</b> · {b.lessonLabel ?? b.title ?? "Booket"} · {who(b)}
                    </>
                  );
                  // Egne bookinger (ikke en lektions) kan åbnes og rettes.
                  return (
                    <li key={b.id} className={`rounded-lg px-2.5 py-1.5 ${who(b) === "Dig" ? "bg-accent-bg" : "bg-soft"}`}>
                      {who(b) === "Dig" && !b.lessonId && date >= today ? (
                        <Link href={`/laerer/book/ny?id=${b.id}`} className="block">
                          {text} <span className="text-[13px] font-semibold text-accent-ink">· Ret</span>
                        </Link>
                      ) : (
                        text
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ok">Ledigt hele dagen</p>
            )}
          </section>
        );
      })}
      {!list.length && (
        <p className="rounded-[20px] border border-line bg-surface p-[18px] text-sm text-muted">
          Ingen {kind === "room" ? "lokaler" : "køretøjer"} at booke.
        </p>
      )}
    </Screen>
  );
}
