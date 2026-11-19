import { requireRole } from "@/lib/auth/session";
import { buildTestPrint, type PlanTemplate } from "@/lib/modulplan/load";
import { createClient } from "@/lib/supabase/server";

// Prøvetryk af en version af modulplanen med testdata: /api/modulplan/proeve/<version-id>. Kun admin. Gemmes ikke.
export async function GET(_request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  await requireRole(["admin"]);
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) return new Response("Versionen findes ikke.", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("module_plan_templates")
    .select("id, version, builtin, storage_path, field_map, courses(course_modules(number))")
    .eq("id", templateId)
    .maybeSingle();
  if (!data) return new Response("Versionen findes ikke.", { status: 404 });
  const numbers = ((data.courses as unknown as { course_modules: { number: number }[] } | null)?.course_modules ?? []).map((m) => m.number).sort((a, b) => a - b);
  const pdf = await buildTestPrint(data as unknown as PlanTemplate, numbers);
  if (!pdf) return new Response("PDF'en kunne ikke læses.", { status: 404 });
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Proevetryk version ${data.version.replace(/[^\w.-]/g, "")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
