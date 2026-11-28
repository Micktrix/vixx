import { SignatureSection } from "@/components/signature-pad";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../../laerer/screen";
import { saveStudentSignature } from "../actions";

// Elevens digitale underskrift (28. nov. 2026). Når eleven bekræfter en kørt lektion, kommer underskriften på
// lektionsplanen ud for lektionen.
export default async function StudentSignaturePage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("student_my_signature", { p_school: membership.schoolId });

  return (
    <Screen title="Min underskrift" sub={user.fullName} back={{ href: "/elev", label: "Tilbage" }}>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <p className="text-[15px]">
          Skriv under én gang. Når du bekræfter en kørt lektion her i appen, kommer din underskrift på din lektionsplan sammen med
          datoen.
        </p>
        <SignatureSection saved={(data as string | null) ?? null} save={saveStudentSignature} />
        <p className="text-[13px] text-muted">Kun du kan se din underskrift her. Den bruges kun på dine egne planer.</p>
      </section>
    </Screen>
  );
}
