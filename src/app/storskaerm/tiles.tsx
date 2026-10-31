import type { ReactNode } from "react";
import { tileGrid } from "@/lib/tile-grid";

export type Tone = "busy" | "free" | "away" | "off";

const TONE: Record<Tone, string> = {
  busy: "border-accent bg-accent-bg",
  free: "border-ok bg-ok-bg",
  away: "border-bad bg-bad-bg",
  off: "border-line2 bg-soft",
};
const DOT: Record<Tone, string> = { busy: "bg-accent", free: "bg-ok", away: "bg-bad", off: "bg-pend" };

export type TileData = { id: string; tone: Tone; name: string; line1: string; line2?: string };

// Fliser i et gitter, der altid fylder feltet præcis: flere fliser giver mindre fliser, aldrig rulning.
// Teksten skalerer med flisens størrelse (container-enheder).
export function TileWall({ tiles, aspect, testId }: { tiles: TileData[]; aspect: number; testId: string }) {
  const { cols, rows } = tileGrid(tiles.length, aspect);
  return (
    <div
      className="grid min-h-0 flex-1 gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      data-testid={testId}
    >
      {tiles.map((t) => (
        <div
          key={t.id}
          className={`flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-xl border-l-[6px] px-3 ${TONE[t.tone]}`}
          style={{ containerType: "size" }}
          data-testid="tile"
          data-tone={t.tone}
        >
          <b className="truncate leading-tight" style={{ fontSize: "clamp(10px, min(10cqw, 30cqh), 34px)" }}>
            {t.name}
          </b>
          <span className="truncate leading-tight text-ink/80" style={{ fontSize: "clamp(9px, min(7cqw, 20cqh), 22px)" }}>
            {t.line1}
          </span>
          {t.line2 && (
            <span className="truncate leading-tight text-muted" style={{ fontSize: "clamp(9px, min(6cqw, 17cqh), 19px)" }}>
              {t.line2}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { tone: Tone; label: string; count: number }[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[clamp(12px,1.1vw,18px)]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <i className={`size-3 rounded-full ${DOT[i.tone]}`} />
          <b>{i.count}</b> {i.label}
        </span>
      ))}
    </span>
  );
}

export function Panel({ title, legend, children }: { title: string; legend: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-[20px] border border-line bg-surface p-[clamp(10px,1.2vw,20px)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[clamp(16px,1.5vw,26px)] font-bold">{title}</h2>
        {legend}
      </div>
      {children}
    </section>
  );
}
