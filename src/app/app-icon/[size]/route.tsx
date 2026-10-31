import { appIcon } from "../icon-image";

const SIZES = ["192", "512"];

export const dynamic = "force-static";
export const generateStaticParams = () => SIZES.map((size) => ({ size }));

export async function GET(_req: Request, { params }: RouteContext<"/app-icon/[size]">) {
  const { size } = await params;
  if (!SIZES.includes(size)) return new Response("Ikke fundet", { status: 404 });
  return appIcon(Number(size));
}
