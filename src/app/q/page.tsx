import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { inputClass, primaryButtonClass } from "@/components/styles";

// Quiz: skriv koden fra storskærmen (eller scan QR-koden, som fører direkte til /q/<kode>).
export default function QuizCodePage() {
  async function go(formData: FormData) {
    "use server";
    const code = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
    redirect(code.length === 6 ? `/q/${code}` : "/q");
  }
  return (
    <AuthShell caption="Vixx" title="Quiz">
      <form action={go} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Koden fra skærmen
          <input name="code" inputMode="numeric" autoComplete="off" maxLength={7} required placeholder="123456" className={`${inputClass} text-center text-2xl tracking-[0.3em]`} />
        </label>
        <button type="submit" className={primaryButtonClass}>
          Videre
        </button>
      </form>
    </AuthShell>
  );
}
