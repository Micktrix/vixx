import { requireRole } from "@/lib/auth/session";
import { archiveLessonPlan, loadLessonPlan, renderLessonPlan } from "@/lib/lesson-plan-pdf";

// Elevens lektionsplan som PDF til print: /api/lektionsplan/<elev-id> (trin E10). Kun skolens lærere, kontor og admin;
// RLS afgør, om brugeren kan se eleven.
export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { user } = await requireRole(["admin", "office", "instructor"]);
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return new Response("Lektionsplanen findes ikke.", { status: 404 });
  const plan = await loadLessonPlan(studentId);
  if (!plan) return new Response("Lektionsplanen findes ikke.", { status: 404 });
  const pdf = await renderLessonPlan(plan);
  await archiveLessonPlan(plan, pdf, user.id);
  const fileName = `Lektionsplan ${plan.student.name}`.normalize("NFKD").replace(/[^\w -]+/g, "").trim() || "Lektionsplan";
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${fileName}.pdf"`, "cache-control": "no-store" },
  });
}
