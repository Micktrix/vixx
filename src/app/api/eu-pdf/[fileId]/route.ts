import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { TEMPLATE_BUCKET } from "@/lib/modulplan/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Hent en lagt op EU-blanket (trin E9b): skolens medarbejdere får et tidsbegrænset link. RLS afgør adgangen.
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  await requireRole(["admin", "office", "instructor"]);
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Filen findes ikke.", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("eu_plan_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!data) return new Response("Filen findes ikke.", { status: 404 });
  const { data: signed } = await createAdminClient().storage.from(TEMPLATE_BUCKET).createSignedUrl(data.storage_path, 60);
  if (!signed) return new Response("Filen findes ikke.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
