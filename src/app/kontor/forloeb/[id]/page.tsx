import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { setCourseLocked, updateCourse } from "../actions";
import { ModuleList, NewModuleForm, type ModuleRow } from "./modules";
import { TemplatesBox } from "./templates-box";

// Ét fast forløb: indstillinger, modulerne med minimum og emner og modulplanens PDF-versioner. Kun admin.
// Forløbet er låst; modulerne og PDF'en kan kun rettes, når admin har låst op (logges).
import { isEuKind } from "../../elever/data";
import { EuTopicList } from "./eu-topics";

export default async function CoursePage({ params }: PageProps<"/kontor/forloeb/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();
  const [{ data: course }, { data: moduleData }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, kind, category_code, active, locked, theory_at_scan, plan_version, min_days")
      .eq("id", id)
      .eq("school_id", membership.schoolId)
      .maybeSingle(),
    supabase.from("course_modules").select("id, number, name, min_theory, min_driving, min_dark, topics, notes").eq("course_id", id).order("number"),
  ]);
  if (!course?.kind) notFound();
  const editing = isAdmin && !course.locked;
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
          {sum("min_driving")} kørsel
          {course.min_days ? ` · Min. ${course.min_days} undervisningsdage` : ""}
          {course.active ? <Pill tone="ok">I brug</Pill> : <Pill>Slået fra</Pill>}
        </p>
      </header>

      {isAdmin && (
        <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
          <ActionForm action={updateCourse} submitLabel="Gem indstillinger" className="flex flex-col gap-2.5">
            <input type="hidden" name="id" value={course.id} />
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="active" defaultChecked={course.active} className="size-[18px] accent-accent" />
              {isEuKind(course.kind) ? "I brug (kan vælges som EU-forløb på eleven)" : "I brug (kan vælges på elever og hold)"}
            </label>
            {!isEuKind(course.kind) && (
              <label className="flex items-start gap-2.5 text-[15px]">
                <input type="checkbox" name="theoryAtScan" defaultChecked={course.theory_at_scan} className="mt-0.5 size-[18px] accent-accent" />
                <span>
                  Teori registreres ved scanning
                  <span className="block text-[13px] text-muted">
                    Til: læreren scanner teori, og hver scanningsdag er en undervisningsdag. Fra: teorien bekræftes, når modulet afsluttes.
                  </span>
                </span>
              </label>
            )}
          </ActionForm>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            {course.locked ? (
              <>
                <span className="text-sm text-muted">🔒 Låst: moduler, minimum, emner og modulplanens PDF kan ikke rettes.</span>
                <ActionForm
                  action={setCourseLocked}
                  submitLabel="Lås op"
                  pendingLabel="…"
                  primary={false}
                  confirmText={`Lås ${course.name} op for at rette det? Det logges.`}
                >
                  <input type="hidden" name="id" value={course.id} />
                  <input type="hidden" name="locked" value="0" />
                </ActionForm>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold text-bad">Låst op: modulerne og modulplanens PDF kan rettes.</span>
                <ActionForm action={setCourseLocked} submitLabel="Lås igen" pendingLabel="…">
                  <input type="hidden" name="id" value={course.id} />
                  <input type="hidden" name="locked" value="1" />
                </ActionForm>
              </>
            )}
          </div>
        </section>
      )}

      {isEuKind(course.kind) ? (
        <EuTopicList courseId={course.id} />
      ) : (
        <>
          <ModuleList modules={modules} isAdmin={editing} />
          {!modules.length && <p className="text-muted">Ingen moduler endnu.</p>}
          {editing && <NewModuleForm key={modules.length} courseId={course.id} next={(modules.at(-1)?.number ?? 0) + 1} />}
          <TemplatesBox courseId={course.id} isAdmin={editing} />
        </>
      )}
    </>
  );
}
