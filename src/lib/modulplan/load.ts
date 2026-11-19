import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { formatPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fillModulePlan, type PlanData } from "./fill";

// Henter alt til elevens modulplan og udfylder Færdselsstyrelsens PDF (trin E8, del 6a).
// Adgangen tjekkes med brugerens egen forbindelse (RLS): kan brugeren ikke se eleven, findes planen ikke.
// Kopierne af underskrifterne kan ikke læses via appen; dem henter serveren bagefter med service role.

const TEMPLATES = new Set(["B-1.1", "C-1.1", "CE-1.1", "D-1.1"]);
const BUCKET = "module-plans";

type StudentRow = {
  id: string;
  school_id: string;
  address: string | null;
  manual_gear: boolean;
  profiles: { full_name: string; phone: string } | null;
  courses: { category_code: string; plan_kind: string; plan_version: string | null; course_modules: { id: string; number: number }[] } | null;
  module_signoffs: { course_module_id: string; lesson_date: string; kind: string; lesson_count: number; manual_gear: boolean }[];
  repetition_lessons: { id: string; lesson_date: string; lesson_count: number }[];
  module_completions: {
    id: string;
    course_module_id: string;
    completed_on: string;
    instructor_name: string;
    extra_theory: number;
    extra_driving: number;
    self_study: string | null;
    transferred: boolean;
    annulled_at: string | null;
  }[];
  module_plan_teachers: { id: string; instructor_name: string; first_on: string }[];
};

export async function loadModulePlan(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select(
      "id, school_id, address, manual_gear, profiles(full_name, phone), courses(category_code, plan_kind, plan_version, course_modules(id, number)), module_signoffs(course_module_id, lesson_date, kind, lesson_count, manual_gear), repetition_lessons(id, lesson_date, lesson_count), module_completions(id, course_module_id, completed_on, instructor_name, extra_theory, extra_driving, self_study, transferred, annulled_at), module_plan_teachers(id, instructor_name, first_on)",
    )
    .eq("id", studentId)
    .maybeSingle();
  const student = data as unknown as StudentRow | null;
  const course = student?.courses;
  if (!student || course?.plan_kind !== "modules") return null;
  const template = `${course.category_code}-${course.plan_version}`;
  if (!TEMPLATES.has(template)) return null;

  const { data: school } = await supabase.from("schools").select("name, cvr, address, contact_phone").eq("id", student.school_id).single();

  // Underskrifterne (service role).
  const admin = createAdminClient();
  const completions = student.module_completions.filter((c) => !c.annulled_at);
  const teacherRows = [...student.module_plan_teachers].sort((a, b) => a.first_on.localeCompare(b.first_on));
  const repetitions = [...student.repetition_lessons].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  const [{ data: completionStrokes }, { data: teacherStrokes }, { data: repetitionStrokes }] = await Promise.all([
    admin.from("module_completions").select("id, strokes").in("id", completions.length ? completions.map((c) => c.id) : [randomUUID()]),
    admin.from("module_plan_teachers").select("id, strokes").in("id", teacherRows.length ? teacherRows.map((t) => t.id) : [randomUUID()]),
    admin.from("repetition_lessons").select("id, strokes").in("id", repetitions.length ? repetitions.map((r) => r.id) : [randomUUID()]),
  ]);
  const strokesOf = (rows: { id: string; strokes: string | null }[] | null, id: string) => rows?.find((r) => r.id === id)?.strokes ?? null;

  const plan: PlanData = {
    student: {
      name: student.profiles?.full_name ?? "",
      phone: student.profiles?.phone ? formatPhone(student.profiles.phone) : "",
      address: student.address ?? "",
    },
    school: {
      name: school?.name ?? "",
      cvr: school?.cvr ?? "",
      address: school?.address ?? "",
      phone: school?.contact_phone ? formatPhone(school.contact_phone) : "",
    },
    teachers: teacherRows.map((t) => ({ name: t.instructor_name, strokes: strokesOf(teacherStrokes, t.id) })),
    modules: [...course.course_modules]
      .sort((a, b) => a.number - b.number)
      .map((m) => {
        const c = completions.find((x) => x.course_module_id === m.id);
        return {
          number: m.number,
          startedOn: student.module_signoffs.filter((s) => s.course_module_id === m.id).map((s) => s.lesson_date).sort()[0] ?? null,
          completion: c
            ? {
                completedOn: c.completed_on,
                name: c.instructor_name,
                strokes: strokesOf(completionStrokes, c.id),
                extraTheory: c.extra_theory,
                extraDriving: c.extra_driving,
                selfStudy: c.self_study,
                transferred: c.transferred,
                // Kode 78 (kun B): kørsel i manuelt gear i modulet.
                manualGear:
                  student.manual_gear && course.category_code === "B"
                    ? student.module_signoffs
                        .filter((s) => s.course_module_id === m.id && s.kind === "driving" && s.manual_gear)
                        .reduce((n, s) => n + s.lesson_count, 0)
                    : null,
              }
            : null,
      };
      }),
    repetitions: repetitions.map((r) => ({ date: r.lesson_date, count: r.lesson_count, strokes: strokesOf(repetitionStrokes, r.id) })),
  };
  return { studentId: student.id, schoolId: student.school_id, template, plan };
}

// Udfyld PDF'en. Er indholdet nyt, gemmes udgaven (den overskrives og slettes aldrig).
export async function buildModulePlan(studentId: string, userId: string) {
  const loaded = await loadModulePlan(studentId);
  if (!loaded) return null;
  const file = await readFile(path.join(process.cwd(), "src/lib/modulplan/templates", `${loaded.template}.pdf`));
  const pdf = await fillModulePlan(new Uint8Array(file), loaded.plan);

  const hash = createHash("sha256").update(JSON.stringify({ template: loaded.template, plan: loaded.plan })).digest("hex");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("module_plan_versions").select("id").eq("student_id", studentId).eq("content_hash", hash).maybeSingle();
  if (!existing) {
    const storagePath = `${loaded.schoolId}/${studentId}/${new Date().toISOString().replace(/[:.]/g, "-")}-${hash.slice(0, 8)}.pdf`;
    const { error } = await admin.storage.from(BUCKET).upload(storagePath, pdf, { contentType: "application/pdf" });
    if (!error) {
      await admin.from("module_plan_versions").insert({
        school_id: loaded.schoolId,
        student_id: studentId,
        template: loaded.template,
        content_hash: hash,
        storage_path: storagePath,
        created_by: userId,
      });
    }
  }
  return { pdf, name: loaded.plan.student.name };
}
