import Link from "next/link";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type CourseRow = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  locked: boolean;
  theory_at_scan: boolean;
  plan_version: string | null;
  course_modules: { min_theory: number; min_driving: number }[];
};

const ORDER = ["B", "C", "CE", "D", "EU_GODS", "EU_BUS", "EU_GODS3", "EU_BUS3", "TAXA"];
const NOTE: Record<string, string> = {
  EU_GODS: "EU-lektionsplan (godstransport). Vælges på eleven oven i kørekortet.",
  EU_BUS: "EU-lektionsplan (personbefordring). Vælges på eleven oven i kørekortet.",
  EU_GODS3: "Godstransport for buschauffører (3 uger). Vælges på eleven.",
  EU_BUS3: "Personbefordring for lastbilchauffører (3 uger). Vælges på eleven.",
  TAXA: "Taxi-lektionsplanen. Planen lægges op senere.",
};

// Skolens faste forløb (ombygning 21. nov. 2026): B, C, C/E, D, EU og Taxa. Oprettes af Vixx; kan slås til og fra.
export default async function CoursesPage() {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, name, kind, active, locked, theory_at_scan, plan_version, course_modules(min_theory, min_driving)")
    .eq("school_id", membership.schoolId)
    .not("kind", "is", null);
  const courses = ((data ?? []) as unknown as CourseRow[]).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  return (
    <>
      <header>
        <p className="text-sm text-muted">Indstillinger</p>
        <h1 className="text-[30px] font-bold">Forløb</h1>
        <p className="text-muted">
          Skolens forløb efter Færdselsstyrelsens modulplaner. De er låst; tryk &quot;Lås op&quot; på forløbet for at rette det eller lægge en ny
          modulplan op.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((k) => (
          <Link
            key={k.id}
            href={`/kontor/forloeb/${k.id}`}
            className={`flex flex-col gap-1 rounded-[18px] border border-line bg-surface p-4 hover:border-accent ${k.active ? "" : "opacity-60"}`}
            data-testid="course-card"
          >
            <b className="text-[19px]">{k.name}</b>
            <span className="text-sm text-muted">
              {k.course_modules.length
                ? `${k.plan_version ? `Modulplan ${k.plan_version} · ` : ""}${k.course_modules.length} moduler · Min. ${k.course_modules.reduce((n, m) => n + m.min_theory, 0)} teori + ${k.course_modules.reduce((n, m) => n + m.min_driving, 0)} kørsel`
                : "Ingen plan endnu"}
            </span>
            {NOTE[k.kind] && <span className="text-[13px] text-muted">{NOTE[k.kind]}</span>}
            <span className="flex flex-wrap gap-1.5">
              {k.active ? <Pill tone="ok">I brug</Pill> : <Pill>Slået fra</Pill>}
              {!k.locked && <Pill>Låst op</Pill>}
              {k.theory_at_scan && <Pill>Teori ved scanning</Pill>}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
