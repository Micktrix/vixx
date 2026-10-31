import type { ReactNode } from "react";
import { fromMinutes } from "@/lib/schedule";
import { NowLine } from "./live";

export type Tone = "busy" | "free" | "away" | "off";

const DOT: Record<Tone, string> = { busy: "bg-accent", free: "bg-ok", away: "bg-bad", off: "bg-pend" };
const TEXT: Record<Tone, string> = { busy: "text-accent-ink", free: "text-ok", away: "text-bad", off: "text-muted" };

export type Block = { key: string; from: number; to: number; label: ReactNode; className: string };
export type BoardRow = { id: string; name: string; tone: Tone; status: string; blocks: Block[] };
export type Range = { from: number; to: number };

const pct = (m: number, r: Range) => `${((m - r.from) / (r.to - r.from)) * 100}%`;

// En tavle med én række pr. underviser eller lokale/køretøj: status lige nu + dagens tidslinje.
// Rækkerne deler højden (og deler sig i to kolonner, hvis der er mange), så alt altid kan ses uden at rulle.
export function Board({
  title,
  legend,
  rows,
  range,
  testId,
  empty,
}: {
  title: string;
  legend: ReactNode;
  rows: BoardRow[];
  range: Range;
  testId: string;
  empty: string;
}) {
  const cols = rows.length > 22 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(rows.length / cols));
  const hours = Array.from({ length: (range.to - range.from) / 60 + 1 }, (_, i) => range.from + i * 60);

  const axis = (
    <div className="flex shrink-0 text-[clamp(10px,0.8vw,13px)] text-muted">
      <div className="w-[44%] shrink-0" />
      <div className="relative h-4 flex-1">
        {hours.slice(0, -1).map((h) => (
          <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: pct(h, range) }}>
            {fromMinutes(h).slice(0, 2)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2 rounded-[18px] border border-line bg-surface p-[clamp(10px,1vw,18px)]">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[clamp(16px,1.4vw,24px)] font-bold">{title}</h2>
        {legend}
      </div>
      {!rows.length && <p className="text-muted">{empty}</p>}
      <div className="grid min-h-0 flex-1 gap-x-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-testid={testId}>
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="flex min-h-0 min-w-0 flex-col">
            {rows.length > 0 && axis}
            {rows.slice(c * perCol, (c + 1) * perCol).map((r) => (
              <div
                key={r.id}
                className="flex max-h-[52px] min-h-0 flex-1 items-stretch border-b border-line last:border-b-0"
                style={{ containerType: "size" }}
                data-testid="board-row"
                data-tone={r.tone}
              >
                <div className="flex w-[44%] shrink-0 items-center gap-2 overflow-hidden pr-2" style={{ fontSize: "clamp(10px, 52cqh, 18px)" }}>
                  <i className={`size-[0.65em] shrink-0 rounded-full ${DOT[r.tone]}`} />
                  <b className="min-w-0 shrink truncate">{r.name}</b>
                  <span className={`ml-auto shrink-0 truncate text-[0.85em] font-semibold ${TEXT[r.tone]}`}>{r.status}</span>
                </div>
                <div className="relative flex-1 bg-bg/60">
                  {hours.map((h) => (
                    <span key={h} className="absolute inset-y-0 border-l border-line" style={{ left: pct(h, range) }} />
                  ))}
                  <NowLine from={range.from} to={range.to} />
                  {r.blocks.map((b) => (
                    <span
                      key={b.key}
                      className={`absolute inset-y-[14%] flex items-center overflow-hidden rounded px-1 leading-none whitespace-nowrap ${b.className}`}
                      style={{ left: pct(b.from, range), width: pct(range.from + b.to - b.from, range), fontSize: "clamp(8px, 40cqh, 14px)" }}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Legend({ items }: { items: { tone: Tone; label: string; count: number }[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[clamp(12px,1vw,17px)]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <i className={`size-3 rounded-full ${DOT[i.tone]}`} />
          <b>{i.count}</b> {i.label}
        </span>
      ))}
    </span>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-[16px] border px-[clamp(10px,1vw,18px)] py-[clamp(6px,0.7vw,12px)] ${accent ? "border-accent-line bg-accent-bg" : "border-line bg-surface"}`}>
      <p className="truncate text-[clamp(11px,0.85vw,15px)] text-muted">{label}</p>
      <p className="text-[clamp(22px,2.2vw,40px)] leading-tight font-bold tabular-nums">
        {value}
        {sub && <span className="text-[0.5em] font-semibold text-muted"> {sub}</span>}
      </p>
    </div>
  );
}
