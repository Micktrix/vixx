"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

// Viser den gemte underskrift låst. "Skriv under" / "Lås op og tegn igen" åbner tegnefeltet i fuld skærm (Michael
// 28. nov. 2026: feltet var for lille på telefonen, og siden rykkede sig med fingeren). Den gamle gælder, til en ny er gemt.
export function SignatureSection({ saved, save }: { saved: string | null; save: (strokes: string) => Promise<ActionState> }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<ActionState>(undefined);

  return (
    <div className="flex flex-col gap-3" data-testid={saved ? "signature-locked" : "signature-missing"}>
      {saved ? (
        <>
          <div className="rounded-xl border border-line2 bg-white p-2">
            <SignatureImage strokes={saved} className="h-auto w-full" />
          </div>
          <p className="text-sm font-semibold text-ok">🔒 Låst</p>
        </>
      ) : (
        <p className="rounded-xl border-2 border-dashed border-line2 bg-white px-4 py-6 text-center text-sm text-muted">Du har ikke skrevet under endnu.</p>
      )}
      <ResultBox state={state} />
      <div>
        <button
          type="button"
          className={saved ? buttonClass : primaryButtonClass}
          onClick={() => {
            if (saved && !window.confirm("Lås op og tegn en ny underskrift? Den gamle gælder, til du gemmer den nye.")) return;
            setState(undefined);
            setEditing(true);
          }}
        >
          {saved ? "Lås op og tegn igen" : "Skriv under"}
        </button>
      </div>
      {editing && (
        <SignaturePad
          onCancel={() => setEditing(false)}
          onSave={async (strokes) => {
            const result = await save(strokes);
            if (result && "message" in result) {
              setState(result);
              setEditing(false);
            }
            return result;
          }}
        />
      )}
    </div>
  );
}

// Tegnefeltet i fuld skærm. Siden kan ikke rulle, mens man skriver. På Android vendes skærmen selv til liggende,
// hvor det kan lade sig gøre; ellers står der et tip om at vende telefonen.
function SignaturePad({ onCancel, onSave }: { onCancel: () => void; onSave: (strokes: string) => Promise<ActionState> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState("");
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Ingen rulning af siden bag feltet, og fingeren på feltet ruller/zoomer ikke (iOS respekterer ikke altid touch-action).
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const svg = svgRef.current;
    const stop = (e: TouchEvent) => e.preventDefault();
    svg?.addEventListener("touchstart", stop, { passive: false });
    svg?.addEventListener("touchmove", stop, { passive: false });

    // Liggende skærm på telefoner, der tillader det (Android i fuld skærm). iPhone: tip på skærmen.
    let locked = false;
    if (window.matchMedia("(pointer: coarse)").matches && document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
        .then(() => (locked = true))
        .catch(() => {});
    }
    return () => {
      document.body.style.overflow = body;
      svg?.removeEventListener("touchstart", stop);
      svg?.removeEventListener("touchmove", stop);
      if (locked) screen.orientation.unlock?.();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  function point(e: React.PointerEvent<SVGSVGElement>) {
    const box = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * SIGNATURE_WIDTH;
    const y = ((e.clientY - box.top) / box.height) * SIGNATURE_HEIGHT;
    return `${round(Math.min(Math.max(x, 0), SIGNATURE_WIDTH))} ${round(Math.min(Math.max(y, 0), SIGNATURE_HEIGHT))}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex touch-none flex-col items-center justify-center gap-3 overscroll-none bg-bg p-3" role="dialog" aria-label="Skriv under" data-testid="signature-pad">
      <p className="text-center text-[15px] font-bold">
        Skriv under i feltet
        <span className="block text-[13px] font-normal text-muted landscape:hidden">Tip: Vend telefonen om på siden, så bliver feltet større.</span>
      </p>
      {/* Feltet har underskriftens format (3:1) og fylder så meget af skærmen som muligt. */}
      <div className="relative rounded-xl border-2 border-dashed border-line2 bg-white" style={{ width: `min(100%, calc((100dvh - 150px) * ${SIGNATURE_WIDTH / SIGNATURE_HEIGHT}))` }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`}
          className="block h-auto w-full touch-none select-none"
          aria-label="Tegn din underskrift her"
          onPointerDown={(e) => {
            e.preventDefault();
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
      <div className="flex flex-wrap justify-center gap-2">
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
        <button type="button" disabled={pending} className={buttonClass} onClick={onCancel}>
          Fortryd
        </button>
      </div>
    </div>
  );
}
