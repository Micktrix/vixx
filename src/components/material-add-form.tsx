"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileButton } from "@/components/file-button";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass, primaryButtonClass } from "@/components/styles";
import type { ActionState } from "@/lib/action-state";
import { addLink, finishUpload, prepareUpload } from "@/lib/material-actions";

type FolderOption = { id: string; label: string };

// Læg en fil eller et link i "Mine materialer" eller i en af skolens mapper. Filen sendes direkte fra
// browseren til fillageret via et link, som serveren har lavet; så skal den ikke igennem Vixx' server.
export function MaterialAddForm({ folders, defaultFolderId = "" }: { folders: FolderOption[]; defaultFolderId?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"file" | "link">("file");
  const [state, setState] = useState<ActionState>(undefined);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState(0); // nulstiller filknappen efter hver upload
  const link = useFormAction(addLink);

  async function uploadFile(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file") as File | null;
    if (!file || !file.size) return setState({ error: "Vælg en fil." });
    setBusy(true);
    setState(undefined);
    try {
      const prepared = await prepareUpload({
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        folderId: String(data.get("folderId") ?? ""),
        fileName: file.name,
        size: file.size,
        mimeType: file.type,
      });
      if ("error" in prepared) return setState(prepared);
      const put = await fetch(prepared.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!put.ok) return setState({ error: "Filen kunne ikke lægges op. Prøv igen." });
      const done = await finishUpload(prepared.id);
      setState(done);
      if (done && "message" in done) {
        form.reset();
        setUploads((n) => n + 1);
        router.refresh();
      }
    } catch {
      setState({ error: "Filen kunne ikke lægges op. Tjek forbindelsen og prøv igen." });
    } finally {
      setBusy(false);
    }
  }

  const common = (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Titel
        <input name="title" required maxLength={120} placeholder="Fx Kryds og rundkørsler" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Beskrivelse (valgfri)
        <input name="description" maxLength={500} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Gem i
        <select name="folderId" defaultValue={defaultFolderId} className={inputClass}>
          <option value="">Mine materialer (kun mig)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              Skolens mappe: {f.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="material-add">
      <div className="flex rounded-[10px] border border-line2 bg-surface p-0.5 text-sm font-bold">
        {(["file", "link"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`flex-1 rounded-lg px-3 py-1.5 ${kind === k ? "bg-accent text-ink" : "text-muted"}`}
          >
            {k === "file" ? "Fil" : "Link"}
          </button>
        ))}
      </div>
      {kind === "file" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void uploadFile(e.currentTarget);
          }}
        >
          {common}
          <div className="flex flex-col gap-1.5 text-sm font-bold">
            Fil (højst 50 MB)
            <FileButton key={uploads} label="Vælg fil" name="file" required />
          </div>
          <p className="text-[13px] text-muted">Læg kun materiale op, som skolen må bruge og dele. Videoer lægges op som links.</p>
          <div>
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? "Lægger op …" : "Læg op"}
            </button>
          </div>
          <ResultBox state={state} />
        </form>
      ) : (
        <form onSubmit={link.onSubmit} className="flex flex-col gap-3">
          {common}
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Link
            <input name="url" type="url" required placeholder="https://" className={inputClass} />
          </label>
          <div>
            <button type="submit" disabled={link.pending} className={primaryButtonClass}>
              {link.pending ? "Gemmer …" : "Gem link"}
            </button>
          </div>
          <ResultBox state={link.state} />
        </form>
      )}
    </div>
  );
}
