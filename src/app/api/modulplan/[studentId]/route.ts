import { requireRole } from "@/lib/auth/session";
import { buildModulePlan } from "@/lib/modulplan/load";

// Elevens udfyldte modulplan som PDF til print: /api/modulplan/<elev-id>. Kun skolens lærere, kontor og admin
// (aftalt 19. nov. 2026); eleven kan ikke hente PDF'en. RLS afgør, om brugeren kan se eleven.
export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { user } = await requireRole(["admin", "office", "instructor"]);
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return new Response("Modulplanen findes ikke.", { status: 404 });

  const built = await buildModulePlan(studentId, user.id);
  if (!built) return new Response("Modulplanen findes ikke.", { status: 404 });

  const fileName = `Modulplan ${built.name}`.normalize("NFKD").replace(/[^\w -]+/g, "").trim() || "Modulplan";
  return new Response(Buffer.from(built.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fileName}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
