import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deleteCourse, updateCourse } from "../actions";
import { ModuleList, NewModuleForm, type ModuleRow } from "./modules";
import { TemplatesBox } from "./templates-box";

// Ét forløb (modulplan): modulerne med minimum og emner og modulplanens PDF-versioner. Kun admin.
export default async function CoursePage({ params }: PageProps<"/kontor/forloeb/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();
  const [{ data: course }, { data: moduleData }] = await Promise.all([
    supabase.from("courses").select("id, name, category_code, active, plan_version, min_days").eq("id", id).eq("school_id", membership.schoolId).maybeSingle(),
    supabase.from("course_modules").select("id, number, name, min_theory, min_driving, min_dark, topics, notes").eq("course_id", id).order("number"),
  ]);
  if (!course) notFound();
  const modules = (moduleData ?? []) as ModuleRow[];
  const sum = (key: "min_theory" | "min_driving") => modules.reduce((n, m) => n + m[key], 0);

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/kontor/forloeb" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Forløb
        </Link>
        <h1 className="text-[30px] font-bold">{course.name}</h1>
        <p className="flex flex-wrap items-center gap-1.5 text-muted">
          Kategori {course.category_code}
          {course.plan_version && ` · Modulplan version ${course.plan_version}`} · {modules.length} moduler · Min. {sum("min_theory")} teori +{" "}
          {sum("min_driving")} kørsel{course.min_days ? ` · Min. ${course.min_days} undervisningsdage` : ""}
          {course.active ? <Pill tone="ok">Aktiv</Pill> : <Pill>Slået fra</Pill>}
        </p>
      </header>

      {isAdmin && (
        <details className="rounded-[20px] border border-line bg-surface p-[18px]">
          <summary className="cursor-pointer font-bold">Ret forløbet</summary>
          <ActionForm action={updateCourse} submitLabel="Gem" className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={course.id} />
            <TextField label="Navn" name="name" required maxLength={80} defaultValue={course.name} className="min-w-[240px]" />
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="active" defaultChecked={course.active} className="size-[18px] accent-accent" />
              I brug (kan vælges, når en elev oprettes)
            </label>
          </ActionForm>
          <ActionForm action={deleteCourse} submitLabel="Slet forløbet" pendingLabel="…" primary={false} confirmText={`Slet forløbet ${course.name}?`}>
            <input type="hidden" name="id" value={course.id} />
          </ActionForm>
        </details>
      )}

      <ModuleList modules={modules} isAdmin={isAdmin} />
      {!modules.length && <p className="text-muted">Ingen moduler endnu.</p>}
      {isAdmin && <NewModuleForm key={modules.length} courseId={course.id} next={(modules.at(-1)?.number ?? 0) + 1} />}
      <TemplatesBox courseId={course.id} isAdmin={isAdmin} />
    </>
  );
}
