import type { MemberActionState } from "./actions";

// Viser svaret fra en handling. En midlertidig kode vises tydeligt og kun denne ene gang.
export function ResultBox({ state }: { state: MemberActionState }) {
  if (!state) return null;
  if ("error" in state) {
    return <p role="alert" className="text-sm font-semibold text-bad">{state.error}</p>;
  }
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-xl border border-accent-line bg-accent-bg px-3.5 py-3 text-sm">
      <p>{state.message}</p>
      {state.tempPassword && (
        <p>
          Midlertidig kode:{" "}
          <code data-testid="temp-password" className="rounded-md bg-surface px-2 py-0.5 font-mono text-base font-bold tracking-wider">
            {state.tempPassword}
          </code>
        </p>
      )}
    </div>
  );
}
