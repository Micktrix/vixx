import type { ReactNode } from "react";

const tones = {
  neutral: "bg-pend-bg text-pend",
  accent: "bg-accent-bg text-accent-ink",
  ok: "bg-ok-bg text-ok",
  bad: "bg-bad-bg text-bad",
};

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}
