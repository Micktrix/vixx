"use client";

import { useState } from "react";
import { finishLogoUpload, prepareLogoUpload, removeLogo } from "./logo-actions";

// Skolens logo: vis det nuværende, læg et nyt op eller fjern det. Vises i appen for lærere, elever og kontor.
export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    const prepared = await prepareLogoUpload({ type: file.type, size: file.size });
    if ("error" in prepared) {
      setResult(prepared);
    } else {
      const put = await fetch(prepared.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }).catch(() => null);
      setResult(put?.ok ? ((await finishLogoUpload(prepared.path)) ?? null) : { error: "Logoet kunne ikke lægges op. Prøv igen." });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-xl border border-line bg-surface p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Skolens logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-muted">Intet logo</span>
          )}
        </div>
        <label className="cursor-pointer rounded-[12px] border border-line px-4 py-2 text-sm font-bold hover:border-accent">
          {busy ? "Lægger op …" : logoUrl ? "Skift logo" : "Læg logo op"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setResult((await removeLogo()) ?? null);
              setBusy(false);
            }}
            className="text-sm font-semibold text-muted hover:text-ink"
          >
            Fjern logo
          </button>
        )}
      </div>
      <p className="text-[13px] text-muted">PNG, JPEG eller WebP, højst 1 MB. Bredt logo på hvid eller gennemsigtig baggrund passer bedst.</p>
      {result?.error && <p className="text-sm text-bad">{result.error}</p>}
      {result?.message && <p className="text-sm text-ok">{result.message}</p>}
    </div>
  );
}
