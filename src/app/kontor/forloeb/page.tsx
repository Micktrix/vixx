import Link from "next/link";
import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createCourseWithPlan } from "./actions";

type CourseRow = {
  id: string;
  name: string;
  category_code: string;
  active: boolean;
  plan_version: string | null;
  course_modules: { min_theory: number; min_driving: number }[];
};

// Forløb pr. kørekortkategori. Admin bygger og retter dem; kontoret kan se dem.
export default async function CoursesPage() {
  const { membership } = await requireRole(["admin"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, category_code, active, plan_version, course_modules(min_theory, min_driving)")
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
        <p className="text-muted">Forløb pr. kørekortkategori med Færdselsstyrelsens modulplan. Ret dem, når styrelsen ændrer noget.</p>
      </header>

      {isAdmin && (
        <Box title="Nyt forløb">
          <ActionForm action={createCourseWithPlan} submitLabel="Opret forløb" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
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
              <TextField label="Navn (valgfrit)" name="name" maxLength={80} placeholder="Fx C – modulplan" className="min-w-[240px] flex-1" />
            </div>
            <p className="text-[13px] text-muted">
              Vixx henter Færdselsstyrelsens modulplan for kategorien (B, C, C/E og D, version 1.1) med moduler, minimum,
              emner og PDF. C og D får også skolens kørelektioner (fra skolens seneste forløb i kategorien). Alt kan rettes
              bagefter. Lader du navnet stå tomt, hedder forløbet fx &quot;C – modulplan&quot;.
            </p>
            <details className="text-[15px]">
              <summary className="cursor-pointer text-sm font-semibold text-accent-ink">Andre muligheder</summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-start gap-2.5">
                  <input type="radio" name="plan" value="standard" defaultChecked className="mt-1 size-[18px] accent-accent" />
                  <span>Færdselsstyrelsens modulplan for kategorien (standard)</span>
                </label>
                <label className="flex items-start gap-2.5">
                  <input type="radio" name="plan" value="own" className="mt-1 size-[18px] accent-accent" />
                  <span>
                    Egen modulplan (fx EU-moduler)
                    <span className="block text-[13px] text-muted">Du bygger modulerne og lægger Færdselsstyrelsens udfyldbare PDF op på forløbet.</span>
                  </span>
                </label>
              </div>
            </details>
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
                return (
                  <Link
                    key={k.id}
                    href={`/kontor/forloeb/${k.id}`}
                    className={`flex flex-col gap-1 rounded-[18px] border border-line bg-surface p-4 hover:border-accent ${k.active ? "" : "opacity-60"}`}
                    data-testid="course-card"
                  >
                    <b className="text-[17px]">{k.name}</b>
                    <span className="text-sm text-muted">
                      {k.plan_version ? `Modulplan ${k.plan_version} · ` : "Egen modulplan · "}
                      {k.course_modules.length} moduler · Min. {k.course_modules.reduce((n, m) => n + m.min_theory, 0)} teori +{" "}
                      {k.course_modules.reduce((n, m) => n + m.min_driving, 0)} kørsel
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
