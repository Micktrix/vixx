import Link from "next/link";
import { notFound } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { Box } from "@/components/box";
import { ActionForm } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { missingFields, placeFields, type FieldMap } from "@/lib/modulplan/field-map";
import { readTemplatePdf, type PlanTemplate } from "@/lib/modulplan/load";
import { createClient } from "@/lib/supabase/server";
import { activateTemplate, deleteTemplateDraft, saveFieldMap } from "../../../template-actions";

const MODULE_FIELDS = [
  ["start", "Dato for opstart", "text"],
  ["end", "Dato for afslutning", "text"],
  ["extraTheory", "Ekstra teorilektioner", "text"],
  ["extraDriving", "Ekstra kørselslektioner", "text"],
  ["selfStudy", "Selvstudie", "text"],
  ["transferred", "Overført fra lektionsplan", "text"],
  ["manualGear", "Manuelt gear (kode 78)", "text"],
  ["name", "Afsluttende kørelærers navn", "text"],
  ["signature", "Afsluttende kørelærers underskrift", "signature"],
] as const;

// Feltkort for en opsendt version (kladde): hvilket felt i PDF'en hver oplysning skal i. Vixx har genkendt det,
// den kunne; admin vælger resten, ser et prøvetryk og tager versionen i brug.
export default async function TemplateFieldsPage({ params }: PageProps<"/kontor/forloeb/[id]/pdf/[templateId]">) {
  const { id, templateId } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: t }, { data: course }] = await Promise.all([
    supabase.from("module_plan_templates").select("id, version, builtin, storage_path, field_map, activated_at").eq("id", templateId).eq("course_id", id).maybeSingle(),
    supabase.from("courses").select("name, course_modules(number)").eq("id", id).maybeSingle(),
  ]);
  if (!t || !course) notFound();
  const template = t as PlanTemplate & { activated_at: string | null };
  const file = await readTemplatePdf(template);
  const fields = file ? placeFields(await PDFDocument.load(file)) : [];
  const map = (template.field_map ?? { student: {}, school: {}, teachers: [], modules: {}, repetitions: [] }) as FieldMap;
  const numbers = (course.course_modules ?? []).map((m) => m.number).sort((a, b) => a - b);
  const missing = missingFields(map, numbers);
  const locked = !!template.activated_at;

  const select = (key: string, label: string, kind: "text" | "signature", value: string | undefined) => (
    <label key={key} className="flex flex-col gap-1 text-sm font-bold">
      {label}
      <select name={`f:${key}`} defaultValue={value ?? ""} disabled={locked} className={inputClass}>
        <option value="">— ikke på planen —</option>
        {fields
          .filter((f) => f.kind === kind)
          .map((f) => (
            <option key={f.name} value={f.name}>
              Side {f.page + 1}: {f.name}
            </option>
          ))}
      </select>
    </label>
  );

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href={`/kontor/forloeb/${id}`} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ {course.name}
        </Link>
        <h1 className="text-[30px] font-bold">Feltkort · version {template.version}</h1>
        <p className="text-muted">
          Vixx har genkendt felterne i PDF&apos;en. Tjek dem, vælg de manglende, og se et prøvetryk, før versionen tages i brug.
        </p>
      </header>

      <Box title="Status">
        {missing.length ? (
          <p className="text-bad" data-testid="missing-fields">
            Mangler: {missing.join(", ")}.
          </p>
        ) : (
          <p className="text-ok">Alle nødvendige felter er sat.</p>
        )}
        <p className="text-sm text-muted">
          Undervisende kørelærere: {map.teachers.length} linjer · Repetitionslektioner: {map.repetitions.length} linjer (genkendt automatisk).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/api/modulplan/proeve/${template.id}`} target="_blank" rel="noopener" className="rounded-[12px] border border-line px-4 py-2 text-sm font-bold hover:border-accent">
            Se prøvetryk (PDF)
          </a>
          {!locked && (
            <ActionForm action={activateTemplate} submitLabel="Tag versionen i brug" confirmText={`Tag version ${template.version} i brug? Nye elever får den, og den kan ikke ændres bagefter.`}>
              <input type="hidden" name="templateId" value={template.id} />
            </ActionForm>
          )}
        </div>
      </Box>

      <ActionForm action={saveFieldMap} submitLabel="Gem feltkortet" className="flex flex-col gap-[18px]">
        <input type="hidden" name="templateId" value={template.id} />
        <Box title="Forsiden og skolen">
          <div className="grid gap-3 sm:grid-cols-2">
            {select("student.name", "Elevens navn", "text", map.student.name)}
            {select("student.phone", "Elevens telefon", "text", map.student.phone)}
            {select("student.address", "Elevens adresse", "text", map.student.address)}
            {select("school.name", "Skolens navn", "text", map.school.name)}
            {select("school.cvr", "Skolens CVR-nr.", "text", map.school.cvr)}
            {select("school.address", "Skolens adresse", "text", map.school.address)}
            {select("school.phone", "Skolens telefon", "text", map.school.phone)}
          </div>
        </Box>
        {numbers.map((n) => (
          <Box key={n} title={`Modul ${n}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODULE_FIELDS.map(([key, label, kind]) => select(`modules.${n}.${key}`, label, kind, map.modules[String(n)]?.[key]))}
            </div>
          </Box>
        ))}
      </ActionForm>

      {!locked && (
        <ActionForm action={deleteTemplateDraft} submitLabel="Slet kladden" pendingLabel="…" primary={false} confirmText={`Slet kladden til version ${template.version}?`}>
          <input type="hidden" name="templateId" value={template.id} />
        </ActionForm>
      )}
    </>
  );
}
