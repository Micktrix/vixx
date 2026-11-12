import QRCode from "qrcode";
import { ActionForm } from "@/components/form";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { StudentHome } from "../../elev/student-home";
import { createDemoStudent, resetDemoStudent } from "./actions";
import { AutoRefresh } from "./auto-refresh";

// Elevens skærm til fremvisning. Admin er selv demo-eleven: scan QR-koden med lærer-appen, kvittér, og
// bekræft her. En demo-elev kommer aldrig på lønnen og vises ikke i kontorets elevlister.
export default async function DemoStudentPage() {
  const { user, membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: demo }, { data: courses }] = await Promise.all([
    supabase
      .from("students")
      .select("id, qr_token, course_id")
      .eq("school_id", membership.schoolId)
      .eq("user_id", user.id)
      .eq("is_demo", true)
      .maybeSingle(),
    supabase.from("courses").select("id, name").eq("school_id", membership.schoolId).eq("active", true).order("name"),
  ]);
  const qr = demo ? await QRCode.toString(`${await siteOrigin()}/laerer/scan/${demo.qr_token}`, { type: "svg", margin: 1 }) : "";

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
          Vis hvordan eleven bruger Vixx. Scan QR-koden med &quot;Scan elev&quot; i lærer-appen, kvittér for en lektion, og bekræft
          den her som eleven. Demo-eleven kommer aldrig på lønnen og vises ikke i elevlisterne.
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
          <div className="flex flex-wrap items-start gap-6">
            <section className="flex w-[300px] flex-col items-center gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
              <h2 className="text-lg font-bold">QR-kode</h2>
              <div
                data-testid="demo-qr"
                className="w-full rounded-[16px] bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="text-center text-sm text-muted">Scan med &quot;Scan elev&quot; i lærer-appen eller med telefonens kamera.</p>
            </section>

            <div
              className="flex h-[760px] w-[380px] max-w-full flex-col overflow-hidden rounded-[36px] border border-line bg-bg shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]"
              data-testid="demo-phone"
            >
              <StudentHome studentId={demo.id} firstName="Demo" schoolName={membership.schoolName} qrLink={false} />
            </div>
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
