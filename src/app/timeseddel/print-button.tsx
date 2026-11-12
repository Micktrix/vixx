"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center rounded-[10px] border border-accent bg-accent px-4 text-sm font-bold text-ink"
    >
      Print
    </button>
  );
}
