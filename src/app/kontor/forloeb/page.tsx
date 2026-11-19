import Link from "next/link";
import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createCourse, createModuleCourse } from "./actions";

type CourseRow = {
  id: string;
  name: string;
  category_code: string;
  active: boolean;
  plan_kind: "lessons" | "modules";
  plan_version: string | null;
  course_modules: { min_theory: number; min_driving: number }[];
  course_lessons: { lesson_count: number; active: boolean }[];
};

// Forløb pr. kørekortkategori. Admin bygger og retter dem; kontoret kan se dem.
export default async function CoursesPage() {
  const { membership } = await requireRole(["admin"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, category_code, active, plan_kind, plan_version, course_modules(min_theory, min_driving), course_lessons(lesson_count, active)")
      .eq("school_id", membership.schoolId)
      .order("name"),
    supabase.from("license_categories").select("code, name").order("sort_order"),
  ]);
  const courses = (data ?? []) as unknown as CourseRow[];
  const used = (categories ?? []).filter((c) => courses.some((k) => k.category_code === c.code));

  return (
    <>
      <header>
        <p className="text-sm text-muted">Indstillinger</p>
        <h1 className="text-[30px] font-bold">Forløb</h1>
        <p className="text-muted">Elevernes lektionsplan pr. kørekortkategori. Ret dem, når ministeriet ændrer noget.</p>
      </header>

      {isAdmin && (
        <Box title="Nyt forløb">
          <ActionForm action={createCourse} submitLabel="Opret forløb" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Kategori
              <select name="category" required defaultValue="" className={`${inputClass.replace("w-full", "")} w-[120px]`}>
                <option value="" disabled>
                  Vælg
                </option>
                {(categories ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Navn" name="name" required maxLength={80} placeholder="Fx C – kørselsundervisning" className="min-w-[240px] flex-1" />
          </ActionForm>
        </Box>
      )}

      {isAdmin && (
        <Box title="Nyt forløb fra modulplanen">
          <ActionForm action={createModuleCourse} submitLabel="Opret modulforløb" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Modulplan
                <select name="template" defaultValue="B-1.1" className={`${inputClass.replace("w-full", "")} w-[260px]`}>
                  <option value="B-1.1">B · version 1.1 (april 2026)</option>
                </select>
              </label>
              <TextField label="Navn" name="name" required maxLength={80} placeholder="Fx B – modulplan" className="min-w-[240px] flex-1" />
            </div>
            <p className="text-[13px] text-muted">
              Modulerne, minimum og emnerne lægges ind fra Færdselsstyrelsens modulplan og kan rettes bagefter.
            </p>
          </ActionForm>
        </Box>
      )}

      {used.map((c) => (
        <section key={c.code} className="flex flex-col gap-2" data-testid="course-category">
          <h2 className="text-lg font-bold">
            Kategori {c.code} <span className="font-normal text-muted">· {c.name}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses
              .filter((k) => k.category_code === c.code)
              .map((k) => {
                const lessons = k.course_lessons.filter((l) => l.active);
                const periods = lessons.reduce((n, l) => n + l.lesson_count, 0);
                return (
                  <Link
                    key={k.id}
                    href={`/kontor/forloeb/${k.id}`}
                    className={`flex flex-col gap-1 rounded-[18px] border border-line bg-surface p-4 hover:border-accent ${k.active ? "" : "opacity-60"}`}
                    data-testid="course-card"
                  >
                    <b className="text-[17px]">{k.name}</b>
                    <span className="text-sm text-muted">
                      {k.plan_kind === "modules"
                        ? `Modulplan ${k.plan_version} · ${k.course_modules.length} moduler · Min. ${k.course_modules.reduce((n, m) => n + m.min_theory, 0)} teori + ${k.course_modules.reduce((n, m) => n + m.min_driving, 0)} kørsel`
                        : `${lessons.length} lektioner · ${periods} × 45 min.`}
                    </span>
                    {!k.active && (
                      <span>
                        <Pill>Slået fra</Pill>
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
      {!courses.length && (
        <p className="text-muted">{isAdmin ? "Ingen forløb endnu. Opret det første ovenfor." : "Ingen forløb endnu. Admin opretter dem."}</p>
      )}
    </>
  );
}
