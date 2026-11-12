"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TOKEN = /\/laerer\/scan\/([0-9a-f-]{36})/i;

// Kameraet læser elevens QR-kode og åbner kvitteringen. Koden er et link, så telefonens eget kamera
// kan også bruges.
export function Scanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const v = video.current;
      if (v && ctx && v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const token = code?.data.match(TOKEN)?.[1];
        if (token) {
          stopped = true;
          router.push(`/laerer/scan/${token}`);
          return;
        }
        if (code) setProblem("Det er ikke en elevs QR-kode fra Vixx.");
      }
      frame = requestAnimationFrame(tick);
    };

    // Uden kamera (eller uden https) afvises løftet, og fejlen vises.
    (navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false }) ?? Promise.reject())
      .then((s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        video.current.play().catch(() => {});
        frame = requestAnimationFrame(tick);
      })
      .catch(() => setProblem("Kameraet kunne ikke startes. Giv Vixx lov til at bruge kameraet, eller scan med telefonens kamera."));

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-[20px] bg-ink">
        <video ref={video} muted playsInline className="size-full object-cover" />
        <span className="pointer-events-none absolute inset-[18%] rounded-[18px] border-4 border-white/80" />
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-bad">
          {problem}
        </p>
      )}
    </div>
  );
}
