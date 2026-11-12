import { ActionForm, CheckChip } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { StudentCalendar } from "../../elev/student-calendar";
import { StudentHome } from "../../elev/student-home";
import { StudentMore } from "../../elev/student-more";
import { StudentNav, type StudentTab } from "../../elev/student-nav";
import { StudentQr } from "../../elev/student-qr";
import { saveStudentTeachers } from "../elever/actions";
import { createDemoStudent, resetDemoStudent } from "./actions";
import { AutoRefresh } from "./auto-refresh";

const PAGE = "/kontor/demo-elev";
const links: Record<StudentTab, string> = {
  kalender: `${PAGE}?side=kalender`,
  forloeb: PAGE,
  qr: `${PAGE}?side=qr`,
  mere: `${PAGE}?side=mere`,
};

// Elevens app til fremvisning med skolens fiktive demo-elev: telefonen viser præcis det, eleven ser, med
// bundmenu, kalender, forløb, QR-kode og Mere. Admin handler på elevens vegne (anmod, afbud, bekræft).
export default async function DemoStudentPage({ searchParams }: PageProps<"/kontor/demo-elev">) {
  const { membership } = await requireRole(["admin"]);
  const sp = await searchParams;
  const side: StudentTab = sp.qr ? "qr" : (["kalender", "qr", "mere"] as const).find((s) => s === sp.side) ?? "forloeb";
  const supabase = await createClient();
  const [{ data: demo }, { data: courses }, { data: instructors }] = await Promise.all([
    supabase
      .from("students")
      .select("id, qr_token, course_id, student_instructors(instructor_id)")
      .eq("school_id", membership.schoolId)
      .eq("is_demo", true)
      .maybeSingle(),
    supabase.from("courses").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("name"),
    supabase.from("instructors").select("id, active_until, school_members(active, profiles(full_name))").eq("school_id", membership.schoolId),
  ]);
  const linked = new Set(((demo?.student_instructors ?? []) as { instructor_id: string }[]).map((l) => l.instructor_id));
  const teachers = (instructors ?? [])
    .map((i) => {
      const m = i.school_members as unknown as { active: boolean; profiles: { full_name: string } | null } | null;
      return { id: i.id, name: m?.profiles?.full_name ?? "", active: !!m?.active && (!i.active_until || i.active_until >= todayDk()) };
    })
    .filter((t) => t.active)
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  const courseSelect = (value?: string) => (
    <label className="flex min-w-[220px] flex-col gap-1.5 text-sm font-bold">
      Forløb
      <select name="courseId" required defaultValue={value ?? courses?.[0]?.id ?? ""} className={inputClass}>
        {(courses ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">Demo</p>
        <h1 className="text-[30px] font-bold">Elevens skærm</h1>
        <p className="max-w-[720px] text-muted">
          Sådan ser elevens app ud. Brug bundmenuen i telefonen. Demo-eleven er fiktiv, vises ikke i elevlisterne og kommer aldrig på
          lønnen. Du handler på elevens vegne.
        </p>
      </header>

      {!demo ? (
        <section className="flex max-w-[760px] flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
          <h2 className="text-lg font-bold">Opret demo-elev</h2>
          {courses?.length ? (
            <ActionForm action={createDemoStudent} submitLabel="Opret demo-elev" className="flex flex-wrap items-end gap-3">
              {courseSelect()}
            </ActionForm>
          ) : (
            <p className="text-sm">Opret først et forløb under Indstillinger → Forløb.</p>
          )}
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <AutoRefresh seconds={5} />
          <div
            className="flex h-[780px] w-[390px] max-w-full flex-col overflow-hidden rounded-[36px] border border-line bg-bg shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]"
            data-testid="demo-phone"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {side === "kalender" && (
                <StudentCalendar schoolId={membership.schoolId} schoolName={membership.schoolName} studentId={demo.id} demo forloebHref={PAGE} />
              )}
              {side === "forloeb" && (
                <StudentHome studentId={demo.id} firstName="Demo" schoolName={membership.schoolName} qrHref={links.qr} demo />
              )}
              {side === "qr" && <StudentQr token={demo.qr_token} name="Demo Elev" closeHref={PAGE} />}
              {side === "mere" && <StudentMore schoolId={membership.schoolId} studentId={demo.id} name="Demo Elev" phone="" demo />}
            </div>
            <StudentNav links={links} current={side} />
          </div>

          <div className="flex max-w-[420px] min-w-[280px] flex-1 flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
              <h2 className="text-lg font-bold">Demo-elevens faste lærere</h2>
              <ActionForm action={saveStudentTeachers} submitLabel="Gem" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={demo.id} />
                <input type="hidden" name="canRequest" value="on" />
                <div className="flex flex-wrap gap-2" data-testid="demo-teachers">
                  {teachers.map((t) => (
                    <CheckChip key={t.id} name="instructors" value={t.id} label={t.name} defaultChecked={linked.has(t.id)} />
                  ))}
                </div>
                <p className="text-[13px] text-muted">
                  Demo-eleven ser de valgte læreres åbne tider under Kalender. Læreren åbner tider under &quot;Åbne tider til elever&quot; i
                  lærer-appen.
                </p>
              </ActionForm>
            </section>

            <details className="rounded-[20px] border border-line bg-surface p-[18px]">
              <summary className="cursor-pointer font-bold">Start forfra</summary>
              <ActionForm
                action={resetDemoStudent}
                submitLabel="Start forfra"
                primary={false}
                confirmText="Fjern demo-elevens kvitteringer, anmodninger og lektioner og start forfra?"
                className="mt-3 flex flex-wrap items-end gap-3"
              >
                {courseSelect(demo.course_id)}
              </ActionForm>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
