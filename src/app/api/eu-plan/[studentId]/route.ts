import { requireRole } from "@/lib/auth/session";
import { archiveEuPlan, loadEuPlan, renderEuPlan } from "@/lib/eu-plan";

// Elevens EU-lektionsplan som PDF til print: /api/eu-plan/<elev-id> (trin E9a). Kun skolens lærere, kontor og admin;
// eleven kan ikke hente den. RLS afgør, om brugeren kan se eleven.
export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { user } = await requireRole(["admin", "office", "instructor"]);
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return new Response("EU-planen findes ikke.", { status: 404 });
  const plan = await loadEuPlan(studentId);
  if (!plan) return new Response("EU-planen findes ikke.", { status: 404 });
  const pdf = await renderEuPlan(plan);
  await archiveEuPlan(plan, pdf, user.id);
  const fileName = `EU-plan ${plan.student.name}`.normalize("NFKD").replace(/[^\w -]+/g, "").trim() || "EU-plan";
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${fileName}.pdf"`, "cache-control": "no-store" },
  });
}
