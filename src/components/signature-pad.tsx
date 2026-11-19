"use client";

import { useRef, useState, useTransition } from "react";
import { ResultBox } from "@/components/form";
import { buttonClass, primaryButtonClass } from "@/components/styles";
import type { ActionState } from "@/lib/action-state";
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH, isValidStrokes } from "@/lib/signature";

const round = (n: number) => Math.round(n * 10) / 10;

// Den gemte underskrift som streger (SVG).
export function SignatureImage({ strokes, className = "" }: { strokes: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`} className={className} role="img" aria-label="Din underskrift">
      <path d={strokes} fill="none" stroke="#1a1a1a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Viser den gemte underskrift låst. "Lås op og tegn igen" åbner tegnefeltet; den gamle gælder, til en ny er gemt.
export function SignatureSection({ saved, save }: { saved: string | null; save: (strokes: string) => Promise<ActionState> }) {
  const [editing, setEditing] = useState(!saved);
  const [state, setState] = useState<ActionState>(undefined);

  if (saved && !editing) {
    return (
      <div className="flex flex-col gap-3" data-testid="signature-locked">
        <div className="rounded-xl border border-line2 bg-white p-2">
          <SignatureImage strokes={saved} className="h-auto w-full" />
        </div>
        <p className="text-sm font-semibold text-ok">🔒 Låst</p>
        <ResultBox state={state} />
        <div>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              if (window.confirm("Lås op og tegn en ny underskrift? Den gamle gælder, til du gemmer den nye.")) {
                setState(undefined);
                setEditing(true);
              }
            }}
          >
            Lås op og tegn igen
          </button>
        </div>
      </div>
    );
  }

  return (
    <SignaturePad
      canCancel={!!saved}
      onCancel={() => setEditing(false)}
      onSave={async (strokes) => {
        const result = await save(strokes);
        setState(result);
        if (result && "message" in result) setEditing(false);
        return result;
      }}
    />
  );
}

function SignaturePad({
  canCancel,
  onCancel,
  onSave,
}: {
  canCancel: boolean;
  onCancel: () => void;
  onSave: (strokes: string) => Promise<ActionState>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState("");
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, startTransition] = useTransition();

  function point(e: React.PointerEvent<SVGSVGElement>) {
    const box = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * SIGNATURE_WIDTH;
    const y = ((e.clientY - box.top) / box.height) * SIGNATURE_HEIGHT;
    return `${round(Math.min(Math.max(x, 0), SIGNATURE_WIDTH))} ${round(Math.min(Math.max(y, 0), SIGNATURE_HEIGHT))}`;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="signature-pad">
      <div className="relative rounded-xl border-2 border-dashed border-line2 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`}
          className="block h-auto w-full touch-none select-none"
          aria-label="Tegn din underskrift her"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const p = point(e);
            setStrokes((s) => `${s}${s ? " " : ""}M ${p} L ${p}`);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const p = point(e);
            setStrokes((s) => `${s} L ${p}`);
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        >
          <line x1="30" x2={SIGNATURE_WIDTH - 30} y1="160" y2="160" stroke="#d9d2c7" strokeWidth={2} />
          {strokes && <path d={strokes} fill="none" stroke="#1a1a1a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        {!strokes && <span className="pointer-events-none absolute inset-x-0 top-[35%] text-center text-sm text-muted">Skriv under med fingeren her</span>}
      </div>
      <ResultBox state={state} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !isValidStrokes(strokes)}
          className={primaryButtonClass}
          onClick={() =>
            startTransition(async () => {
              const result = await onSave(strokes);
              setState(result);
            })
          }
        >
          {pending ? "Gemmer …" : "Gem og lås"}
        </button>
        <button type="button" disabled={!strokes || pending} className={buttonClass} onClick={() => setStrokes("")}>
          Ryd
        </button>
        {canCancel && (
          <button type="button" disabled={pending} className={buttonClass} onClick={onCancel}>
            Fortryd
          </button>
        )}
      </div>
    </div>
  );
}
