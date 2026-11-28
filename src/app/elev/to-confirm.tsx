"use client";

import Link from "next/link";
import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { formatDate } from "@/lib/dates";
import { confirmScans, disputeScan } from "./actions";

export type ToConfirm = { kind: string; id: string; title: string; lesson_date: string; instructor_name: string; lessons: number | null };

const primary = "inline-flex h-10 items-center rounded-[10px] border border-accent bg-accent px-3 text-sm font-bold text-ink disabled:opacity-60";
const plain = "inline-flex h-10 items-center rounded-[10px] border border-line2 bg-surface px-3 text-sm font-semibold disabled:opacity-60";

// "Venter på din bekræftelse" (28. nov. 2026): hver scanning, læreren har lavet, bekræftes af eleven med "Bekræft"
// (elevens underskrift kommer på) eller "Det passer ikke" (læreren får besked). Læreren kan køre videre imens.
export function ToConfirmBox({ items, hasSignature }: { items: ToConfirm[]; hasSignature: boolean }) {
  const all = useFormAction(confirmScans);
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] border border-accent-line bg-accent-bg p-[18px]" data-testid="to-confirm">
      <h2 className="font-bold">
        {items.length === 1 ? "1 lektion venter" : `${items.length} lektioner venter`} på din bekræftelse
      </h2>
      {!hasSignature ? (
        <p className="text-sm">
          Skriv under én gang, så kan du bekræfte dine lektioner.{" "}
          <Link href="/elev/underskrift" className="font-bold text-accent-ink underline underline-offset-[3px]">
            Skriv under
          </Link>
        </p>
      ) : (
        <>
          {items.map((i) => (
            <Item key={`${i.kind}:${i.id}`} item={i} />
          ))}
          {items.length > 1 && (
            <form onSubmit={all.onSubmit} className="flex flex-col gap-1.5">
              {items.map((i) => (
                <input key={`${i.kind}:${i.id}`} type="hidden" name="item" value={`${i.kind}:${i.id}`} />
              ))}
              <button type="submit" disabled={all.pending} className={`${primary} justify-center`}>
                {all.pending ? "Bekræfter …" : `Bekræft alle ${items.length}`}
              </button>
              <ResultBox state={all.state} />
            </form>
          )}
        </>
      )}
    </section>
  );
}

function Item({ item }: { item: ToConfirm }) {
  const ok = useFormAction(confirmScans);
  const no = useFormAction(disputeScan);
  const [disputing, setDisputing] = useState(false);
  const value = `${item.kind}:${item.id}`;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-3.5 py-2.5" data-testid="confirm-item">
      <span className="text-[15px]">
        <b>{item.title}</b>
        <span className="block text-[13px] text-muted">
          {formatDate(item.lesson_date)} · {item.instructor_name}
          {item.lessons ? ` · ${item.lessons} × 45 min.` : ""}
        </span>
      </span>
      {disputing ? (
        <form onSubmit={no.onSubmit} className="flex flex-col gap-2">
          <input type="hidden" name="item" value={value} />
          <label className="flex flex-col gap-1 text-sm font-bold">
            Hvad passer ikke? (valgfri)
            <textarea name="note" rows={2} maxLength={500} className="w-full rounded-[10px] border border-line2 px-3 py-2 font-normal" />
          </label>
          <span className="flex gap-2">
            <button type="submit" disabled={no.pending} className={plain}>
              {no.pending ? "Sender …" : "Send til min kørelærer"}
            </button>
            <button type="button" onClick={() => setDisputing(false)} className={plain}>
              Fortryd
            </button>
          </span>
          <ResultBox state={no.state} />
        </form>
      ) : (
        <form onSubmit={ok.onSubmit} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="item" value={value} />
          <button type="submit" disabled={ok.pending} className={primary}>
            {ok.pending ? "…" : "Bekræft"}
          </button>
          <button type="button" onClick={() => setDisputing(true)} className={plain}>
            Det passer ikke
          </button>
          <ResultBox state={ok.state} />
        </form>
      )}
    </div>
  );
}
