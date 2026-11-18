import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Åbn eller hent et materiale: /api/materialer/<id>. Databasen afgør, om brugeren må se det (RLS); så
// sendes man videre til linket eller til et downloadlink, der kun virker i et minut.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Materialet findes ikke.", { status: 404 });

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("materials")
    .select("kind, url, storage_path, file_name, ready")
    .eq("id", id)
    .maybeSingle();
  if (!material || !material.ready) return new Response("Materialet findes ikke.", { status: 404 });
  if (material.kind === "link" && material.url) return NextResponse.redirect(material.url);

  const download = new URL(request.url).searchParams.get("hent") !== null;
  const { data } = await createAdminClient()
    .storage.from("materials")
    .createSignedUrl(material.storage_path!, 60, download ? { download: material.file_name ?? true } : undefined);
  if (!data?.signedUrl) return new Response("Filen kunne ikke hentes. Prøv igen.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
