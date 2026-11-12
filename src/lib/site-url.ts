import "server-only";
import { headers } from "next/headers";

// Adressen, siden blev åbnet på (fx https://test.vixx.dk), til links i kalender og QR-kode.
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "test.vixx.dk";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
