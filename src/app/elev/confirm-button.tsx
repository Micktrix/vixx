"use client";

import { ResultBox, useFormAction } from "@/components/form";
import { primaryButtonClass } from "@/components/styles";
import { confirmSignoff } from "./actions";

export function ConfirmButton({ id }: { id: string }) {
  const { state, onSubmit, pending } = useFormAction(confirmSignoff);
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
