import Link from "next/link";
import { Box } from "@/components/box";
import { Pill } from "@/components/pill";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { TemplateUpload } from "./template-upload";

// Modulplanens PDF-versioner for et modulforløb (trin E8, del 6c-1). Alle kan se, hvilke versioner der er;
// kun admin lægger op, retter feltkort og tager i brug.
export async function TemplatesBox({ courseId, isAdmin }: { courseId: string; isAdmin: boolean }) {
  const supabase = await createClient();
  const [{ data: templates }, { data: students }] = await Promise.all([
    supabase.from("module_plan_templates").select("id, version, builtin, activated_at, created_at").eq("course_id", courseId).order("created_at"),
    supabase.from("students").select("plan_template_id").eq("course_id", courseId).eq("is_demo", false),
  ]);
  const list = templates ?? [];
  const newest = list.filter((t) => t.activated_at).sort((a, b) => (b.activated_at ?? "").localeCompare(a.activated_at ?? ""))[0];
  const countOf = (id: string) => (students ?? []).filter((s) => s.plan_template_id === id).length;

  return (
    <Box title="Modulplanens PDF" hint="Færdselsstyrelsens udfyldbare modulplan, som Vixx udfylder for hver elev">
      <ul className="flex flex-col" data-testid="plan-templates">
        {list.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 text-[15px] last:border-b-0">
            <b>Version {t.version}</b>
            <span className="text-sm text-muted">{t.builtin ? "Indbygget i Vixx" : `Lagt op ${formatDate(t.created_at.slice(0, 10))}`}</span>
            {t.activated_at ? <Pill tone="ok">{t.id === newest?.id ? "I brug · nye elever" : "I brug"}</Pill> : <Pill>Kladde</Pill>}
            <span className="text-sm text-muted">{countOf(t.id)} elever</span>
            {isAdmin && (
              <span className="ml-auto flex gap-3 text-sm font-semibold">
                <a href={`/api/modulplan/proeve/${t.id}`} target="_blank" rel="noopener" className="text-accent-ink">
                  Prøvetryk
                </a>
                {!t.activated_at && (
                  <Link href={`/kontor/forloeb/${courseId}/pdf/${t.id}`} className="text-accent-ink">
                    Feltkort og tag i brug ›
                  </Link>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {!list.length && <p className="text-muted">Ingen PDF endnu. Læg Færdselsstyrelsens udfyldbare modulplan op.</p>}
      {isAdmin && (
        <details className="mt-2 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-accent-ink">Læg en ny version op</summary>
          <div className="mt-3">
            <TemplateUpload courseId={courseId} />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Nye elever får den nyeste version i brug. Elever i gang beholder deres version; admin kan flytte en elev på elevsiden.
          </p>
        </details>
      )}
    </Box>
  );
}
