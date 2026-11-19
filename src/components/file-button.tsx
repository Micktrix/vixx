"use client";

import { useState } from "react";
import { buttonClass } from "@/components/styles";

// En tydelig knap til at vælge en fil (i stedet for browserens lille standardfelt). Viser filnavnet bagefter.
export function FileButton({
  label,
  name,
  accept,
  required,
  disabled,
  onFile,
}: {
  label: string;
  name?: string;
  accept?: string;
  required?: boolean;
  disabled?: boolean;
  onFile?: (file: File | undefined) => void;
}) {
  const [fileName, setFileName] = useState("");
  return (
    <span className="flex flex-wrap items-center gap-3">
      <label className={`${buttonClass} relative cursor-pointer gap-2 hover:border-accent`}>
        <span aria-hidden>📎</span>
        {fileName ? "Vælg en anden" : label}
        <input
          type="file"
          name={name}
          accept={accept}
          required={required}
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileName(file?.name ?? "");
            onFile?.(file);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <span className="min-w-0 truncate text-sm font-normal text-muted">{fileName || "Ingen fil valgt"}</span>
    </span>
  );
}
