import { ActionForm } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StudentHome } from "../../elev/student-home";
import { StudentQr } from "../../elev/student-qr";
import { createDemoStudent, resetDemoStudent } from "./actions";
import { AutoRefresh } from "./auto-refresh";

const PAGE = "/kontor/demo-elev";

// Elevens skærm til fremvisning med skolens fiktive demo-elev: telefonen viser præcis det, eleven ser.
// "Vis min QR-kode" viser en test-QR-kode, som scannes med "Scan elev" i lærer-appen.
export default async function DemoStudentPage({ searchParams }: PageProps<"/kontor/demo-elev">) {
  const { membership } = await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: demo }, { data: courses }] = await Promise.all([
    supabase.from("students").select("id, qr_token, course_id").eq("school_id", membership.schoolId).eq("is_demo", true).maybeSingle(),
    supabase.from("courses").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("name"),
  ]);

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
          Sådan ser elevens app ud. Tryk &quot;Vis min QR-kode&quot;, scan koden med &quot;Scan elev&quot; i lærer-appen, kvittér for en
          lektion, og bekræft den her som eleven. Demo-eleven er fiktiv, vises ikke i elevlisterne og kommer aldrig på lønnen.
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
        <>
          <AutoRefresh seconds={5} />
          <div
            className="flex h-[780px] w-[390px] max-w-full flex-col overflow-hidden rounded-[36px] border border-line bg-bg shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]"
            data-testid="demo-phone"
          >
            {sp.qr ? (
              <StudentQr token={demo.qr_token} name="Demo Elev" closeHref={PAGE} />
            ) : (
              <StudentHome studentId={demo.id} firstName="Demo" schoolName={membership.schoolName} qrHref={`${PAGE}?qr=1`} demo />
            )}
          </div>

          <details className="max-w-[760px] rounded-[20px] border border-line bg-surface p-[18px]">
            <summary className="cursor-pointer font-bold">Start forfra</summary>
            <ActionForm
              action={resetDemoStudent}
              submitLabel="Start forfra"
              primary={false}
              confirmText="Fjern demo-elevens kvitteringer og start forfra?"
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              {courseSelect(demo.course_id)}
            </ActionForm>
          </details>
        </>
      )}
    </>
  );
}
