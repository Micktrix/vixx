"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputClass } from "@/components/styles";
import { finishTemplateUpload, prepareTemplateUpload } from "../template-actions";

// Læg en ny version af Færdselsstyrelsens udfyldbare modulplan op. Filen sendes direkte til lageret; derefter
// genkender Vixx felterne, og admin kommer til feltkortet.
export function TemplateUpload({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const prepared = await prepareTemplateUpload({ courseId, version, size: file.size, type: file.type });
    if ("error" in prepared) {
      setError(prepared.error ?? "PDF'en kunne ikke lægges op.");
      setBusy(false);
      return;
    }
    const put = await fetch(prepared.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }).catch(() => null);
    if (!put?.ok) {
      setError("PDF'en kunne ikke lægges op. Prøv igen.");
      setBusy(false);
      return;
    }
    const result = await finishTemplateUpload({ courseId, version, path: prepared.path });
    if (result && "id" in result) {
      router.push(`/kontor/forloeb/${courseId}/pdf/${result.id}`);
      return;
    }
    setError((result && "error" in result && result.error) || "PDF'en kunne ikke gemmes.");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Version
          <input value={version} onChange={(e) => setVersion(e.target.value)} maxLength={20} placeholder="Fx 1.2" className={`${inputClass.replace("w-full", "")} w-[120px]`} />
        </label>
        <label className={`rounded-[12px] border border-line px-4 py-2.5 text-sm font-bold ${version.trim() && !busy ? "cursor-pointer hover:border-accent" : "opacity-50"}`}>
          {busy ? "Lægger op …" : "Vælg PDF og læg op"}
          <input
            type="file"
            accept="application/pdf"
            disabled={!version.trim() || busy}
            className="sr-only"
            data-testid="template-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      <p className="text-[13px] text-muted">Brug den digitale (udfyldbare) udgave fra Færdselsstyrelsen. Højst 20 MB.</p>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
