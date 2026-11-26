import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LESSON_FIELDS, LESSON_SIGNOFF_FIELDS, lengthText, lessonLines, type LessonSignoff, type SchoolLesson } from "@/lib/lesson-plan";
import { drawStrokes } from "@/lib/modulplan/fill";
import { formatPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Lektionsplanen som PDF (trin E10): hver lektion med dato, "faktisk anvendt tid" (lektionens længde) og den kørende
// lærers underskrift. Eleven skriver under med kuglepen. Hver ny udgave gemmes (som modulplanen).

type Plan = {
  studentId: string;
  schoolId: string;
  courseName: string;
  student: { name: string; phone: string };
  school: { name: string; address: string; phone: string };
  lessons: (SchoolLesson & { done: (LessonSignoff & { strokes: string | null }) | null })[];
};

export async function loadLessonPlan(studentId: string): Promise<Plan | null> {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("students")
    .select("id, school_id, course_id, profiles(full_name, phone), courses!students_school_id_course_id_fkey(name)")
    .eq("id", studentId)
    .maybeSingle();
  if (!s) return null;
  const [{ data: lessons }, { data: signoffs }, { data: school }] = await Promise.all([
    supabase.from("school_lessons").select(LESSON_FIELDS).eq("course_id", s.course_id),
    supabase.from("lesson_signoffs").select(LESSON_SIGNOFF_FIELDS).eq("student_id", studentId),
    supabase.from("schools").select("name, address, contact_phone").eq("id", s.school_id).single(),
  ]);
  if (!lessons?.length) return null;
  const rows = (signoffs ?? []) as (LessonSignoff & { id: string })[];
  const { data: strokes } = await createAdminClient()
    .from("lesson_signoffs")
    .select("id, strokes")
    .in("id", rows.length ? rows.map((r) => r.id) : [randomUUID()]);
  const profile = s.profiles as unknown as { full_name: string; phone: string } | null;
  return {
    studentId: s.id,
    schoolId: s.school_id,
    courseName: (s.courses as unknown as { name: string } | null)?.name ?? "",
    student: { name: profile?.full_name ?? "", phone: profile?.phone ? formatPhone(profile.phone) : "" },
    school: { name: school?.name ?? "", address: school?.address ?? "", phone: school?.contact_phone ? formatPhone(school.contact_phone) : "" },
    lessons: (lessons as SchoolLesson[])
      .sort((a, b) => a.number - b.number)
      .map((l) => {
        const done = rows.find((r) => r.school_lesson_id === l.id);
        return { ...l, done: done ? { ...done, strokes: (strokes ?? []).find((x) => x.id === done.id)?.strokes ?? null } : null };
      }),
  };
}

const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

export async function renderLessonPlan(plan: Plan): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const M = 50;
  const ink = rgb(0.1, 0.1, 0.1);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = ink) => page.drawText(t, { x, y: y - size, size, font: f, color });

  // Hoved
  text(`Lektionsplan – ${plan.courseName}`, M, 18, bold);
  y -= 30;
  text(`Elev: ${plan.student.name}`, M, 11);
  text(plan.school.name, W / 2 + 20, 11, bold);
  y -= 16;
  text(`Tlf.: ${plan.student.phone}`, M, 11);
  text(plan.school.address, W / 2 + 20, 10);
  y -= 16;
  if (plan.school.phone) text(`Tlf.: ${plan.school.phone}`, W / 2 + 20, 10);
  y -= 26;

  const BOX_X = M + 290;
  const BOX_W = W - M - BOX_X;
  for (const l of plan.lessons) {
    const skipped = new Set((l.done?.skipped ?? "").split("\n").filter(Boolean));
    // Lange linjer ombrydes (ca. 62 tegn), så intet bliver skåret af.
    const lines = lessonLines(l.items).flatMap((line) => {
      const label = skipped.has(line) ? `${line} (ikke gennemført)` : line;
      const out: string[] = [];
      let cur = "";
      for (const word of label.split(" ")) {
        if (cur && `${cur} ${word}`.length > 62) {
          out.push(cur);
          cur = `  ${word}`;
        } else cur = cur ? `${cur} ${word}` : word;
      }
      out.push(cur);
      return out.map((t) => ({ t, bad: skipped.has(line) }));
    });
    const height = Math.max(20 + lines.length * 11 + (l.control ? 14 : 0) + (l.note ? 12 : 0), 96);
    if (y - height < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
    const top = y;
    text(l.title.toUpperCase(), M, 11.5, bold);
    y -= 15;
    text(lengthText(l), M, 9.5);
    y -= 14;
    for (const line of lines) {
      text(line.t, M + 6, 8.5, font, line.bad ? rgb(0.6, 0.15, 0.1) : ink);
      y -= 11;
    }
    if (l.control) {
      y -= 3;
      text(l.control, M + 6, 9, bold);
      y -= 11;
    }
    if (l.note) {
      text(l.note, M + 6, 8, font, rgb(0.4, 0.4, 0.4));
      y -= 11;
    }

    // Underskriftsfeltet: dato og tid, kørelærer, elev.
    const rowH = 30;
    const bx = BOX_X;
    const by = top - 4;
    page.drawRectangle({ x: bx, y: by - rowH * 3, width: BOX_W, height: rowH * 3, borderColor: ink, borderWidth: 0.8 });
    page.drawLine({ start: { x: bx, y: by - rowH }, end: { x: bx + BOX_W, y: by - rowH }, thickness: 0.8, color: ink });
    page.drawLine({ start: { x: bx, y: by - rowH * 2 }, end: { x: bx + BOX_W, y: by - rowH * 2 }, thickness: 0.8, color: ink });
    page.drawLine({ start: { x: bx + BOX_W * 0.62, y: by }, end: { x: bx + BOX_W * 0.62, y: by - rowH }, thickness: 0.8, color: ink });
    const small = (t: string, x: number, yy: number) => page.drawText(t, { x, y: yy, size: 6.5, font, color: ink });
    small("Dato for underskrivning", bx + 3, by - 8);
    small("Faktisk anvendt tid i min.:", bx + BOX_W * 0.62 + 3, by - 8);
    small("Kørelærerens underskrift", bx + 3, by - rowH - 8);
    small("Elevens underskrift", bx + 3, by - rowH * 2 - 8);
    if (l.done) {
      page.drawText(date(l.done.lesson_date), { x: bx + 6, y: by - 24, size: 10, font, color: ink });
      page.drawText(String(l.units.length * 45), { x: bx + BOX_W * 0.62 + 8, y: by - 24, size: 10, font, color: ink });
      if (l.done.strokes) drawStrokes(page, l.done.strokes, { x: bx + 70, y: by - rowH * 2 + 2, width: BOX_W - 80, height: rowH - 10 });
    }
    y = Math.min(y, by - rowH * 3) - 18;
  }
  return doc.save();
}

// Hver ny udgave gemmes og slettes aldrig (arkivet `module_plan_versions`, lageret `module-plans`).
export async function archiveLessonPlan(plan: Plan, pdf: Uint8Array, userId: string) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ kind: "lessons", student: plan.student, lessons: plan.lessons.map((l) => [l.id, l.done?.lesson_date, l.done?.instructor_name, l.done?.skipped]) }))
    .digest("hex");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("module_plan_versions").select("id").eq("student_id", plan.studentId).eq("content_hash", hash).maybeSingle();
  if (existing) return;
  const path = `${plan.schoolId}/${plan.studentId}/lektionsplan-${new Date().toISOString().replace(/[:.]/g, "-")}-${hash.slice(0, 8)}.pdf`;
  const { error } = await admin.storage.from("module-plans").upload(path, pdf, { contentType: "application/pdf" });
  if (error) return;
  await admin.from("module_plan_versions").insert({
    school_id: plan.schoolId,
    student_id: plan.studentId,
    template: `${plan.courseName} lektionsplan`.slice(0, 40),
    content_hash: hash,
    storage_path: path,
    created_by: userId,
  });
}
