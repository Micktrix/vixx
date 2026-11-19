import { SignatureSection } from "@/components/signature-pad";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../screen";
import { saveSignature } from "./actions";

// Lærerens digitale underskrift. Kun læreren selv kan se den. Senere sætter Vixx den på modulplanen,
// når læreren afslutter et modul.
export default async function SignaturePage() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructor_signatures")
    .select("strokes")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <Screen title="Min underskrift" sub={user.fullName} back={{ href: "/laerer/beskeder", label: "Tilbage" }}>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <p className="text-[15px]">
          Skriv under én gang. Når du afslutter et modul i elevens modulplan, sætter Vixx din underskrift på sammen med dato og
          dit navn.
        </p>
        <SignatureSection saved={data?.strokes ?? null} save={saveSignature} />
        <p className="text-[13px] text-muted">Kun du kan se din underskrift. Kontoret og de andre lærere har ikke adgang til den.</p>
      </section>
    </Screen>
  );
}
