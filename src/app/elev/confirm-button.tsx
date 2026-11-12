"use client";

import { ResultBox, useFormAction } from "@/components/form";
import { primaryButtonClass } from "@/components/styles";
import { confirmDemoSignoff } from "../kontor/demo-elev/actions";
import { confirmSignoff } from "./actions";

// "Bekræft" (elevens underskrift). For demo-eleven bekræfter admin på elevens vegne.
export function ConfirmButton({ id, demo = false }: { id: string; demo?: boolean }) {
  const { state, onSubmit, pending } = useFormAction(demo ? confirmDemoSignoff : confirmSignoff);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "…" : "Bekræft"}
      </button>
      <ResultBox state={state} />
    </form>
  );
}
