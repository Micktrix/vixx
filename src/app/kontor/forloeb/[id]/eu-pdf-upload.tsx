"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishEuPdfUpload, prepareEuPdfUpload } from "../eu-actions";

// Læg skolens nye EU-blanket op (trin E9b). Filen sendes direkte til lageret og gemmes som version.
export function EuPdfUpload({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    const prepared = await prepareEuPdfUpload({ courseId, size: file.size, type: file.type });
    if ("error" in prepared) {
      setMessage({ ok: false, text: prepared.error ?? "PDF'en kunne ikke lægges op." });
      setBusy(false);
      return;
    }
    const put = await fetch(prepared.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }).catch(() => null);
    if (!put?.ok) {
      setMessage({ ok: false, text: "PDF'en kunne ikke lægges op. Prøv igen." });
      setBusy(false);
      return;
    }
    const result = await finishEuPdfUpload({ courseId, path: prepared.path, fileName: file.name });
    setMessage(result && "error" in result && result.error ? { ok: false, text: result.error } : { ok: true, text: "Blanketten er lagt op." });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={`self-start rounded-[12px] border border-line px-4 py-2.5 text-sm font-bold ${busy ? "opacity-50" : "cursor-pointer hover:border-accent"}`}>
        {busy ? "Lægger op …" : "Læg ny blanket op (PDF)"}
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          className="sr-only"
          data-testid="eu-pdf-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {message && <p className={`text-sm ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>}
    </div>
  );
}
