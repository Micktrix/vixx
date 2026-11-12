import Link from "next/link";
import QRCode from "qrcode";
import { siteOrigin } from "@/lib/site-url";
import { Screen } from "../laerer/screen";

// Elevens QR-kode. Læreren scanner den og kvitterer for lektionen; koden er et link til lærer-appen.
// Bruges af elevens app og af demo-eleven i kontoret.
export async function StudentQr({ token, name, closeHref }: { token: string; name: string; closeHref: string }) {
  const svg = await QRCode.toString(`${await siteOrigin()}/laerer/scan/${token}`, { type: "svg", margin: 1 });
  const back = (
    <Link href={closeHref} className="text-sm font-semibold text-muted">
      Luk
    </Link>
  );
  return (
    <Screen title="Min QR-kode" sub={name} action={back}>
      <div
        data-testid="student-qr"
        className="mx-auto w-full max-w-[320px] rounded-[20px] border border-line bg-white p-4 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-center text-[15px] text-muted">Vis koden til din kørelærer efter lektionen. Bagefter bekræfter du lektionen her i appen.</p>
    </Screen>
  );
}
