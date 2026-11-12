import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "../../laerer/screen";

// Elevens QR-kode. Læreren scanner den og kvitterer for lektionen; koden er et link til lærer-appen.
export default async function StudentQrPage() {
  const { user, membership } = await requireRole(["student"]);
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("qr_token")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!student) notFound();
  const svg = await QRCode.toString(`${await siteOrigin()}/laerer/scan/${student.qr_token}`, { type: "svg", margin: 1 });

  const back = (
    <Link href="/elev" className="text-sm font-semibold text-muted">
      Luk
    </Link>
  );
  return (
    <Screen title="Min QR-kode" sub={user.fullName} action={back}>
      <div
        data-testid="student-qr"
        className="mx-auto w-full max-w-[320px] rounded-[20px] border border-line bg-white p-4 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-center text-[15px] text-muted">Vis koden til din kørelærer efter lektionen. Bagefter bekræfter du lektionen her i appen.</p>
    </Screen>
  );
}
